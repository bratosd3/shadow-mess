package com.shadow.messenger.ui.screens.customize

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shadow.messenger.ui.theme.*

data class ThemeOption(
    val id: String,
    val name: String,
    val previewBg: Color,
    val previewSurface: Color,
    val previewText: Color
)

data class AccentOption(
    val hex: String,
    val name: String,
    val color: Color
)

private val themes = listOf(
    ThemeOption("dark", "Тёмная", DarkBackground, DarkSurface, DarkOnBackground),
    ThemeOption("light", "Светлая", LightBackground, LightSurface, LightOnBackground),
    ThemeOption("midnight", "Полночь", MidnightBackground, MidnightSurface, MidnightOnBackground),
    ThemeOption("ocean", "Океан", OceanBackground, OceanSurface, OceanOnBackground),
    ThemeOption("forest", "Лес", ForestBackground, ForestSurface, ForestOnBackground),
    ThemeOption("sunset", "Закат", SunsetBackground, SunsetSurface, SunsetOnBackground),
    ThemeOption("amoled", "AMOLED", AmoledBackground, AmoledSurface, AmoledOnBackground),
    ThemeOption("rose", "Роза", RoseBackground, RoseSurface, RoseOnBackground),
)

private val accents = listOf(
    AccentOption("#7C3AED", "Фиолет", AccentPurple),
    AccentOption("#3B82F6", "Синий", AccentBlue),
    AccentOption("#10B981", "Зелёный", AccentGreen),
    AccentOption("#EF4444", "Красный", AccentRed),
    AccentOption("#F97316", "Оранж", AccentOrange),
    AccentOption("#EC4899", "Розовый", AccentPink),
    AccentOption("#EAB308", "Жёлтый", AccentYellow),
    AccentOption("#06B6D4", "Голубой", AccentCyan),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomizeSheet(
    currentTheme: String,
    onThemeChange: (String) -> Unit,
    onAccentChange: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val colors = ShadowTheme.colors
    var selectedTheme by remember { mutableStateOf(currentTheme.ifEmpty { "dark" }) }
    var selectedAccent by remember { mutableStateOf("#7C3AED") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = colors.surface,
        contentColor = colors.onSurface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Кастомизация",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.onSurface
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, "Закрыть")
                }
            }

            Spacer(Modifier.height(24.dp))

            // Themes
            Text(
                "Тема",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.onSurface
            )
            Spacer(Modifier.height(12.dp))

            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(themes) { theme ->
                    ThemeCard(
                        theme = theme,
                        isSelected = selectedTheme == theme.id,
                        accentColor = colors.accent,
                        onClick = {
                            selectedTheme = theme.id
                            onThemeChange(theme.id)
                        }
                    )
                }
            }

            Spacer(Modifier.height(28.dp))

            // Accent colors
            Text(
                "Цвет акцента",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.onSurface
            )
            Spacer(Modifier.height(12.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                accents.take(4).forEach { accent ->
                    AccentCircle(
                        accent = accent,
                        isSelected = selectedAccent == accent.hex,
                        onClick = {
                            selectedAccent = accent.hex
                            onAccentChange(accent.hex)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                accents.drop(4).forEach { accent ->
                    AccentCircle(
                        accent = accent,
                        isSelected = selectedAccent == accent.hex,
                        onClick = {
                            selectedAccent = accent.hex
                            onAccentChange(accent.hex)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun ThemeCard(
    theme: ThemeOption,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(theme.previewBg)
                .then(
                    if (isSelected) Modifier.border(2.dp, accentColor, RoundedCornerShape(16.dp))
                    else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(theme.previewSurface)
                )
                Box(
                    Modifier
                        .fillMaxWidth(0.7f)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(theme.previewSurface)
                )
                Box(
                    Modifier
                        .fillMaxWidth(0.5f)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(accentColor.copy(alpha = 0.5f))
                )
            }
            if (isSelected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(16.dp)
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            theme.name,
            fontSize = 12.sp,
            color = if (isSelected) accentColor else ShadowTheme.colors.onSurfaceVariant
        )
    }
}

@Composable
fun AccentCircle(
    accent: AccentOption,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(accent.color)
                .then(
                    if (isSelected) Modifier.border(3.dp, Color.White, CircleShape)
                    else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            if (isSelected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            accent.name,
            fontSize = 11.sp,
            color = ShadowTheme.colors.onSurfaceVariant
        )
    }
}
