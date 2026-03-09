package com.shadow.messenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

import org.json.JSONArray;
import org.json.JSONObject;

public class NotificationService extends Service {
    private static final String TAG = "ShadowNotifService";
    private static final String CHANNEL_SERVICE = "shadow_service";
    private static final String CHANNEL_MSG = "shadow_messages";
    private static final long POLL_INTERVAL = 30_000; // 30 seconds
    private static final String SERVER_URL = "https://shadow-mess.onrender.com";
    private static final String PREFS_NAME = "shadow_notif_prefs";

    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private String authToken;
    private String currentUserId;
    private int notifId = 5000;
    private volatile boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createServiceChannel();
        createMessageChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String token = intent.getStringExtra("token");
            String userId = intent.getStringExtra("userId");
            if (token != null) authToken = token;
            if (userId != null) currentUserId = userId;

            // Persist credentials
            if (token != null) {
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                    .putString("token", token)
                    .putString("userId", userId)
                    .apply();
            }
        }

        // Restore credentials from prefs if not provided
        if (authToken == null) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            authToken = prefs.getString("token", null);
            currentUserId = prefs.getString("userId", null);
        }

        if (authToken == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(1, buildForegroundNotification());
        acquireWakeLock();

        if (!running) {
            running = true;
            handler.post(pollRunnable);
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(pollRunnable);
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Service channel — completely silent and invisible
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_SERVICE,
                "Фоновая работа",
                NotificationManager.IMPORTANCE_MIN
            );
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            channel.setDescription("Фоновое получение сообщений");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void createMessageChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_MSG,
                "Сообщения",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setShowBadge(true);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 200, 100, 200});
            channel.enableLights(true);
            channel.setLightColor(0xFF50A2E9);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setDescription("Уведомления о новых сообщениях");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildForegroundNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Make the foreground notification as invisible as possible:
        // - No title, no text, no ticker
        // - PRIORITY_MIN + IMPORTANCE_NONE channel
        // - VISIBILITY_SECRET hides from lockscreen
        // - FOREGROUND_SERVICE_DEFERRED delays showing
        // - setShowWhen(false) hides timestamp
        // - setSilent(true) prevents sound/vibration
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(pi)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .setShowWhen(false)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setGroup("shadow_bg")
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY);

        return builder.build();
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shadow:notif");
            wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 hours max
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            new Thread(() -> {
                pollServer();
                if (running) {
                    handler.postDelayed(pollRunnable, POLL_INTERVAL);
                }
            }).start();
        }
    };

    private void pollServer() {
        if (authToken == null) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String lastPoll = prefs.getString("lastPoll", null);
        if (lastPoll == null) {
            // First poll — use current time minus 1 minute
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            lastPoll = sdf.format(new Date(System.currentTimeMillis() - 60000));
        }

        HttpURLConnection conn = null;
        try {
            String urlStr = SERVER_URL + "/api/notifications/poll?since=" +
                java.net.URLEncoder.encode(lastPoll, "UTF-8");
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);

            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                JSONObject response = new JSONObject(sb.toString());
                JSONArray messages = response.getJSONArray("messages");

                if (messages.length() > 0) {
                    // Update last poll time to latest message timestamp
                    String latestTimestamp = messages.getJSONObject(0).getString("timestamp");
                    prefs.edit().putString("lastPoll", latestTimestamp).apply();

                    // Show notifications
                    for (int i = 0; i < messages.length(); i++) {
                        JSONObject msg = messages.getJSONObject(i);
                        showMessageNotification(msg);
                    }
                } else {
                    // No messages — update lastPoll to now
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    prefs.edit().putString("lastPoll", sdf.format(new Date())).apply();
                }
            } else if (code == 401) {
                // Token expired — stop service
                Log.w(TAG, "Auth token expired, stopping service");
                running = false;
                stopSelf();
            }
        } catch (Exception e) {
            Log.e(TAG, "Poll error: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void showMessageNotification(JSONObject msg) {
        try {
            String senderName = msg.optString("senderName", "Новое сообщение");
            String text = msg.optString("text", "");
            String type = msg.optString("type", "text");

            if (text.isEmpty()) {
                switch (type) {
                    case "image": text = "📷 Фото"; break;
                    case "video": text = "🎬 Видео"; break;
                    case "file": text = "📎 Файл"; break;
                    case "audio":
                    case "voice": text = "🎤 Голосовое сообщение"; break;
                    case "sticker": text = "🎭 Стикер"; break;
                    default: text = "Новое сообщение"; break;
                }
            }

            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, notifId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MSG)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(senderName)
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setVibrate(new long[]{0, 200, 100, 200})
                .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_LIGHTS);

            try {
                NotificationManagerCompat nm = NotificationManagerCompat.from(this);
                nm.notify(notifId++, builder.build());
            } catch (SecurityException ignored) {}
        } catch (Exception e) {
            Log.e(TAG, "Notification error: " + e.getMessage());
        }
    }

    /** Called from MainActivity when app comes to foreground to avoid duplicate notifications */
    public static void clearLastPollTime(Context context) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putString("lastPoll", sdf.format(new Date()))
            .apply();
    }

    /** Clear stored credentials on logout */
    public static void clearCredentials(Context context) {
        context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().clear().apply();
    }
}
