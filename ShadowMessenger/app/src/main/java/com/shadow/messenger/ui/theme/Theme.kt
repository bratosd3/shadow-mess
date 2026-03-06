package com.shadow.messenger.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color

// ── Custom theme colors holder ───────────────────────────────────────────
@Stable
data class ShadowColors(
    val background: Color,
    val surface: Color,
    val surfaceVariant: Color,
    val card: Color,
    val sidebar: Color,
    val serverBar: Color,
    val onBackground: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    val accent: Color,
    val onAccent: Color = Color.White,
    val online: Color = OnlineGreen,
    val offline: Color = OfflineGray,
    val error: Color = Color(0xFFEF4444)
)

val LocalShadowColors = staticCompositionLocalOf {
    ShadowColors(
        background = DarkBackground,
        surface = DarkSurface,
        surfaceVariant = DarkSurfaceVariant,
        card = DarkCard,
        sidebar = DarkSidebar,
        serverBar = DarkServerBar,
        onBackground = DarkOnBackground,
        onSurface = DarkOnSurface,
        onSurfaceVariant = DarkOnSurfaceVariant,
        accent = AccentPurple
    )
}

fun shadowColors(themeName: String, accentColor: Color = AccentPurple): ShadowColors {
    return when (themeName) {
        "light" -> ShadowColors(
            background = LightBackground, surface = LightSurface,
            surfaceVariant = LightSurfaceVariant, card = LightCard,
            sidebar = LightSidebar, serverBar = LightServerBar,
            onBackground = LightOnBackground, onSurface = LightOnSurface,
            onSurfaceVariant = LightOnSurfaceVariant, accent = accentColor,
            onAccent = Color.White
        )
        "midnight" -> ShadowColors(
            background = MidnightBackground, surface = MidnightSurface,
            surfaceVariant = MidnightSurfaceVariant, card = MidnightSurfaceVariant,
            sidebar = Color(0xFF0D1117), serverBar = Color(0xFF010409),
            onBackground = MidnightOnBackground, onSurface = MidnightOnBackground,
            onSurfaceVariant = Color(0xFF8B949E), accent = accentColor
        )
        "ocean" -> ShadowColors(
            background = OceanBackground, surface = OceanSurface,
            surfaceVariant = OceanSurfaceVariant, card = OceanSurfaceVariant,
            sidebar = Color(0xFF071020), serverBar = Color(0xFF040A15),
            onBackground = OceanOnBackground, onSurface = OceanOnBackground,
            onSurfaceVariant = Color(0xFF6B8EAD), accent = accentColor
        )
        "forest" -> ShadowColors(
            background = ForestBackground, surface = ForestSurface,
            surfaceVariant = ForestSurfaceVariant, card = ForestSurfaceVariant,
            sidebar = Color(0xFF071007), serverBar = Color(0xFF040A04),
            onBackground = ForestOnBackground, onSurface = ForestOnBackground,
            onSurfaceVariant = Color(0xFF6BAD6B), accent = accentColor
        )
        "sunset" -> ShadowColors(
            background = SunsetBackground, surface = SunsetSurface,
            surfaceVariant = SunsetSurfaceVariant, card = SunsetSurfaceVariant,
            sidebar = Color(0xFF100707), serverBar = Color(0xFF0A0404),
            onBackground = SunsetOnBackground, onSurface = SunsetOnBackground,
            onSurfaceVariant = Color(0xFFAD6B6B), accent = accentColor
        )
        "amoled" -> ShadowColors(
            background = AmoledBackground, surface = AmoledSurface,
            surfaceVariant = AmoledSurfaceVariant, card = AmoledSurfaceVariant,
            sidebar = Color(0xFF000000), serverBar = Color(0xFF000000),
            onBackground = AmoledOnBackground, onSurface = AmoledOnBackground,
            onSurfaceVariant = Color(0xFF888888), accent = accentColor
        )
        "rose" -> ShadowColors(
            background = RoseBackground, surface = RoseSurface,
            surfaceVariant = RoseSurfaceVariant, card = RoseSurfaceVariant,
            sidebar = Color(0xFF10070E), serverBar = Color(0xFF0A040A),
            onBackground = RoseOnBackground, onSurface = RoseOnBackground,
            onSurfaceVariant = Color(0xFFAD6B8E), accent = accentColor
        )
        else -> ShadowColors( // dark (default)
            background = DarkBackground, surface = DarkSurface,
            surfaceVariant = DarkSurfaceVariant, card = DarkCard,
            sidebar = DarkSidebar, serverBar = DarkServerBar,
            onBackground = DarkOnBackground, onSurface = DarkOnSurface,
            onSurfaceVariant = DarkOnSurfaceVariant, accent = accentColor
        )
    }
}

fun parseAccentColor(hex: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (_: Exception) {
        AccentPurple
    }
}

@Composable
fun ShadowMessengerTheme(
    themeName: String = "dark",
    accentHex: String = "#7C3AED",
    content: @Composable () -> Unit
) {
    val accent = parseAccentColor(accentHex)
    val colors = shadowColors(themeName, accent)

    val isDark = themeName != "light"

    val materialColors = if (isDark) {
        darkColorScheme(
            primary = accent,
            onPrimary = Color.White,
            background = colors.background,
            surface = colors.surface,
            surfaceVariant = colors.surfaceVariant,
            onBackground = colors.onBackground,
            onSurface = colors.onSurface,
            onSurfaceVariant = colors.onSurfaceVariant,
            error = colors.error,
            outline = colors.onSurfaceVariant
        )
    } else {
        lightColorScheme(
            primary = accent,
            onPrimary = Color.White,
            background = colors.background,
            surface = colors.surface,
            surfaceVariant = colors.surfaceVariant,
            onBackground = colors.onBackground,
            onSurface = colors.onSurface,
            onSurfaceVariant = colors.onSurfaceVariant,
            error = colors.error,
            outline = colors.onSurfaceVariant
        )
    }

    CompositionLocalProvider(LocalShadowColors provides colors) {
        MaterialTheme(
            colorScheme = materialColors,
            typography = Typography(),
            content = content
        )
    }
}

object ShadowTheme {
    val colors: ShadowColors
        @Composable
        @ReadOnlyComposable
        get() = LocalShadowColors.current
}
