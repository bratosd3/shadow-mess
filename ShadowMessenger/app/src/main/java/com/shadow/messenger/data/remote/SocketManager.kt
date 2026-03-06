package com.shadow.messenger.data.remote

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor() {

    private var socket: Socket? = null
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    enum class ConnectionState { CONNECTED, DISCONNECTED, CONNECTING, ERROR }

    fun connect(baseUrl: String, token: String) {
        if (socket?.connected() == true) return

        _connectionState.value = ConnectionState.CONNECTING

        val options = IO.Options.builder()
            .setExtraHeaders(mapOf("Authorization" to listOf("Bearer $token")))
            .setAuth(mapOf("token" to token))
            .setReconnection(true)
            .setReconnectionAttempts(10)
            .setReconnectionDelay(2000)
            .build()

        socket = IO.socket(baseUrl, options).apply {
            on(Socket.EVENT_CONNECT) {
                Log.d("SocketManager", "Connected")
                _connectionState.value = ConnectionState.CONNECTED
            }
            on(Socket.EVENT_DISCONNECT) {
                Log.d("SocketManager", "Disconnected")
                _connectionState.value = ConnectionState.DISCONNECTED
            }
            on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e("SocketManager", "Connection error: ${args.firstOrNull()}")
                _connectionState.value = ConnectionState.ERROR
            }
            connect()
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    // ── Emit events ───────────────────────────────────────────────────
    fun joinChat(chatId: String) {
        socket?.emit("join_chat", JSONObject().put("chatId", chatId))
    }

    fun startTyping(chatId: String) {
        socket?.emit("typing_start", JSONObject().put("chatId", chatId))
    }

    fun stopTyping(chatId: String) {
        socket?.emit("typing_stop", JSONObject().put("chatId", chatId))
    }

    fun markRead(chatId: String) {
        socket?.emit("mark_read", JSONObject().put("chatId", chatId))
    }

    // ── Listen for events ─────────────────────────────────────────────
    fun <T> on(event: String, transform: (Array<out Any>) -> T): Flow<T> = callbackFlow {
        val listener = io.socket.emitter.Emitter.Listener { args ->
            trySend(transform(args))
        }
        socket?.on(event, listener)
        awaitClose {
            socket?.off(event, listener)
        }
    }

    fun onNewMessage(): Flow<JSONObject> = on("new_message") { args ->
        args[0] as JSONObject
    }

    fun onMessageEdited(): Flow<JSONObject> = on("message_edited") { args ->
        args[0] as JSONObject
    }

    fun onMessageDeleted(): Flow<JSONObject> = on("message_deleted") { args ->
        args[0] as JSONObject
    }

    fun onMessageReaction(): Flow<JSONObject> = on("message_reaction") { args ->
        args[0] as JSONObject
    }

    fun onTypingStart(): Flow<JSONObject> = on("typing") { args ->
        args[0] as JSONObject
    }

    fun onTypingStop(): Flow<JSONObject> = on("typing_stop") { args ->
        args[0] as JSONObject
    }

    fun onUserOnline(): Flow<JSONObject> = on("user_online") { args ->
        args[0] as JSONObject
    }

    fun onUserOffline(): Flow<JSONObject> = on("user_offline") { args ->
        args[0] as JSONObject
    }

    fun onChatCreated(): Flow<JSONObject> = on("chat_created") { args ->
        args[0] as JSONObject
    }

    fun onChatUpdated(): Flow<JSONObject> = on("chat_updated") { args ->
        args[0] as JSONObject
    }

    fun onChatDeleted(): Flow<JSONObject> = on("chat_deleted") { args ->
        args[0] as JSONObject
    }

    fun onMessagesRead(): Flow<JSONObject> = on("messages_read") { args ->
        args[0] as JSONObject
    }
}
