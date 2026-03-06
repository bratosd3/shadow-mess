package com.shadow.messenger.ui.screens.main

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.shadow.messenger.data.remote.SocketManager
import com.shadow.messenger.domain.model.Chat
import com.shadow.messenger.domain.model.User
import com.shadow.messenger.ui.screens.chat.ChatScreen
import com.shadow.messenger.ui.screens.customize.CustomizeSheet
import com.shadow.messenger.ui.theme.ShadowTheme
import com.shadow.messenger.ui.theme.OnlineGreen

@Composable
fun MainScreen(
    onLogout: () -> Unit,
    viewModel: MainViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val colors = ShadowTheme.colors
    val configuration = LocalConfiguration.current
    val isWideScreen = configuration.screenWidthDp >= 600

    LaunchedEffect(Unit) {
        viewModel.state.collect { s ->
            // нужно, если пользователь вышел
        }
    }

    // Customize bottom sheet
    if (state.showCustomize) {
        CustomizeSheet(
            currentTheme = "", // будет из Flow
            onThemeChange = viewModel::saveTheme,
            onAccentChange = viewModel::saveAccent,
            onDismiss = viewModel::toggleCustomize
        )
    }

    if (isWideScreen) {
        // Tablet/landscape: side-by-side layout
        Row(modifier = Modifier.fillMaxSize().background(colors.background)) {
            // Chat list
            ChatListPanel(
                state = state,
                viewModel = viewModel,
                onLogout = onLogout,
                modifier = Modifier.width(320.dp)
            )

            // Divider
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(1.dp)
                    .background(colors.surfaceVariant)
            )

            // Chat or placeholder
            if (state.selectedChatId != null) {
                ChatScreen(
                    chatId = state.selectedChatId!!,
                    currentUserId = state.currentUser?.id ?: "",
                    onBack = viewModel::clearSelectedChat,
                    modifier = Modifier.weight(1f)
                )
            } else {
                // Empty state
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Outlined.Chat,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = colors.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Выберите чат",
                            color = colors.onSurfaceVariant,
                            fontSize = 18.sp
                        )
                    }
                }
            }
        }
    } else {
        // Phone: stack navigation
        if (state.selectedChatId != null) {
            ChatScreen(
                chatId = state.selectedChatId!!,
                currentUserId = state.currentUser?.id ?: "",
                onBack = viewModel::clearSelectedChat,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            ChatListPanel(
                state = state,
                viewModel = viewModel,
                onLogout = onLogout,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListPanel(
    state: MainState,
    viewModel: MainViewModel,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = ShadowTheme.colors

    Column(
        modifier = modifier.background(colors.surface)
    ) {
        // Top bar
        TopAppBar(
            title = {
                Column {
                    Text(
                        "Shadow Messenger",
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    )
                    // Connection status
                    AnimatedVisibility(
                        visible = state.connectionState != SocketManager.ConnectionState.CONNECTED
                    ) {
                        Text(
                            text = when (state.connectionState) {
                                SocketManager.ConnectionState.CONNECTING -> "Подключение..."
                                SocketManager.ConnectionState.ERROR -> "Нет соединения"
                                else -> "Отключён"
                            },
                            fontSize = 12.sp,
                            color = when (state.connectionState) {
                                SocketManager.ConnectionState.ERROR -> colors.error
                                else -> colors.onSurfaceVariant
                            }
                        )
                    }
                }
            },
            actions = {
                IconButton(onClick = viewModel::toggleNewChat) {
                    Icon(Icons.Default.Edit, "Новый чат", tint = colors.accent)
                }
                IconButton(onClick = viewModel::toggleCustomize) {
                    Icon(Icons.Default.Palette, "Кастомизация", tint = colors.accent)
                }
                IconButton(onClick = {
                    viewModel.logout()
                    onLogout()
                }) {
                    Icon(Icons.Default.Logout, "Выйти", tint = colors.onSurfaceVariant)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = colors.sidebar,
                titleContentColor = colors.onSurface
            )
        )

        // New chat dialog
        AnimatedVisibility(visible = state.showNewChat) {
            NewChatSection(state, viewModel)
        }

        // Chat list
        if (state.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = colors.accent)
            }
        } else if (state.chats.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Outlined.Forum,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = colors.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Нет чатов",
                        color = colors.onSurfaceVariant,
                        fontSize = 16.sp
                    )
                    Text(
                        "Начните новый разговор",
                        color = colors.onSurfaceVariant.copy(alpha = 0.6f),
                        fontSize = 13.sp
                    )
                }
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(state.chats, key = { it.id }) { chat ->
                    ChatItem(
                        chat = chat,
                        isSelected = chat.id == state.selectedChatId,
                        currentUserId = state.currentUser?.id ?: "",
                        onClick = { viewModel.selectChat(chat.id) }
                    )
                }
            }
        }
    }
}

@Composable
fun NewChatSection(state: MainState, viewModel: MainViewModel) {
    val colors = ShadowTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surfaceVariant)
            .padding(16.dp)
    ) {
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = viewModel::searchUsers,
            label = { Text("Поиск пользователей") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = null)
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = colors.accent,
                cursorColor = colors.accent
            )
        )

        if (state.isSearching) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                color = colors.accent
            )
        }

        state.searchResults.forEach { user ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { viewModel.createPrivateChat(user.id) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                UserAvatar(user = user, size = 40)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        user.displayName,
                        fontWeight = FontWeight.Medium,
                        color = colors.onSurface
                    )
                    Text(
                        "@${user.username}",
                        fontSize = 13.sp,
                        color = colors.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun ChatItem(
    chat: Chat,
    isSelected: Boolean,
    currentUserId: String,
    onClick: () -> Unit
) {
    val colors = ShadowTheme.colors
    val chatName = when {
        chat.type == "group" || chat.type == "channel" -> chat.name ?: "Группа"
        chat.otherUser != null -> chat.otherUser.displayName
        else -> chat.name ?: "Чат"
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isSelected) colors.accent.copy(alpha = 0.15f)
                else Color.Transparent
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Box {
            if (chat.otherUser?.avatar != null) {
                AsyncImage(
                    model = chat.otherUser.avatar,
                    contentDescription = null,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(
                            parseAvatarColor(
                                chat.otherUser?.avatarColor ?: chat.avatarColor
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = chatName.take(1).uppercase(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }
            }

            // Online indicator
            if (chat.otherUser?.online == true) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(colors.surface)
                        .padding(2.dp)
                        .clip(CircleShape)
                        .background(OnlineGreen)
                        .align(Alignment.BottomEnd)
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = chatName,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    color = colors.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                if (chat.lastMessage != null) {
                    Text(
                        text = formatTime(chat.lastMessage.timestamp),
                        fontSize = 12.sp,
                        color = colors.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(2.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = when {
                        chat.lastMessage == null -> ""
                        chat.lastMessage.type == "image" -> "📷 Фото"
                        chat.lastMessage.type == "file" -> "📎 ${chat.lastMessage.fileName ?: "Файл"}"
                        chat.lastMessage.type == "voice" -> "🎤 Голосовое"
                        else -> chat.lastMessage.text
                    },
                    fontSize = 13.sp,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                if (chat.unreadCount > 0) {
                    Badge(
                        containerColor = colors.accent,
                        contentColor = Color.White
                    ) {
                        Text(
                            text = if (chat.unreadCount > 99) "99+" else chat.unreadCount.toString(),
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun UserAvatar(user: User, size: Int = 40) {
    if (user.avatar != null) {
        AsyncImage(
            model = user.avatar,
            contentDescription = null,
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop
        )
    } else {
        Box(
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(parseAvatarColor(user.avatarColor)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = user.displayName.take(1).uppercase(),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size / 2.5).sp
            )
        }
    }
}

fun parseAvatarColor(hsl: String?): Color {
    if (hsl == null) return Color(0xFF7C3AED)
    return try {
        if (hsl.startsWith("#")) Color(android.graphics.Color.parseColor(hsl))
        else {
            // Parse hsl(h,s%,l%)
            val match = Regex("""hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)""").find(hsl)
            if (match != null) {
                val (h, s, l) = match.destructured
                val color = android.graphics.Color.HSVToColor(
                    floatArrayOf(h.toFloat(), s.toFloat() / 100f, l.toFloat() / 100f * 2f)
                )
                Color(color)
            } else Color(0xFF7C3AED)
        }
    } catch (_: Exception) {
        Color(0xFF7C3AED)
    }
}

fun formatTime(timestamp: String): String {
    return try {
        val instant = java.time.Instant.parse(timestamp)
        val local = java.time.LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault())
        val now = java.time.LocalDate.now()
        val date = local.toLocalDate()

        if (date == now) {
            "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
        } else if (date == now.minusDays(1)) {
            "Вчера"
        } else {
            "${date.dayOfMonth}.${date.monthValue.toString().padStart(2, '0')}"
        }
    } catch (_: Exception) {
        ""
    }
}
