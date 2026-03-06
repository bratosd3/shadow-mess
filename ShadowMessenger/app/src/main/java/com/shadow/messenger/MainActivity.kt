package com.shadow.messenger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.compose.rememberNavController
import com.shadow.messenger.data.repository.MessengerRepository
import com.shadow.messenger.data.repository.PrefsRepository
import com.shadow.messenger.ui.navigation.AppNavigation
import com.shadow.messenger.ui.navigation.Screen
import com.shadow.messenger.ui.theme.ShadowMessengerTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var repository: MessengerRepository
    @Inject lateinit var prefs: PrefsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // Check if user has saved session
        var isLoggedIn = false
        var keepSplash = true
        splashScreen.setKeepOnScreenCondition { keepSplash }

        enableEdgeToEdge()

        setContent {
            val theme by prefs.themeFlow.collectAsState(initial = "dark")
            val accent by prefs.accentFlow.collectAsState(initial = "#7C3AED")
            val navController = rememberNavController()

            // Restore session
            LaunchedEffect(Unit) {
                isLoggedIn = repository.restoreSession()
                keepSplash = false
            }

            ShadowMessengerTheme(
                themeName = theme,
                accentHex = accent
            ) {
                AppNavigation(
                    navController = navController,
                    startDestination = if (isLoggedIn) Screen.Main.route else Screen.Auth.route
                )
            }
        }
    }
}
