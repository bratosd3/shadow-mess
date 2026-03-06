package com.shadow.messenger.ui.screens.chat

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.shadow.messenger.domain.model.Message
import com.shadow.messenger.ui.screens.main.UserAvatar
import com.shadow.messenger.ui.screens.main.parseAvatarColor
import com.shadow.messenger.ui.theme.ShadowTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    chatId: String,
    currentUserId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val colors = ShadowTheme.colors
    val listState = rememberLazyListState()

    LaunchedEffect(chatId) {
        viewModel.loadChat(chatId)
    }

    // Auto-scroll on new message
    LaunchedEffect(state.messages.firstOrNull()?.id) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(0)
        }
    }

    Column(
        modifier = modifier.background(colors.background)
    ) {
        // Top bar
        TopAppBar(
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Назад",
                        tint = colors.onSurface
                    )
                }
            },
            title = {
                Column {
                    Text(
                        "Чат",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                    if (state.typingUsers.isNotEmpty()) {
                        Text(
                            "печатает...",
                            fontSize = 12.sp,
                            color = colors.accent
                        )
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = colors.surface,
                titleContentColor = colors.onSurface
            )
        )

        // Messages
        Box(modifier = Modifier.weight(1f)) {
            if (state.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = colors.accent
                )
            } else if (state.messages.isEmpty()) {
                Text(
                    "Нет сообщений. Начните разговор!",
                    modifier = Modifier.align(Alignment.Center),
                    color = colors.onSurfaceVariant,
                    fontSize = 14.sp
                )
            } else {
                LazyColumn(
                    state = listState,
                    reverseLayout = true,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            isOwn = message.senderId == currentUserId,
                            onReply = { viewModel.setReplyTo(message) },
                            onEdit = {
                                if (message.senderId == currentUserId) {
                                    viewModel.startEditing(message)
                                }
                            },
                            onDelete = {
                                if (message.senderId == currentUserId) {
                                    viewModel.deleteMessage(message.id)
                                }
                            },
                            onReact = { emoji -> viewModel.reactToMessage(message.id, emoji) }
                        )
                    }

                    // Load more trigger
                    if (state.hasMore) {
                        item {
                            LaunchedEffect(Unit) {
                                viewModel.loadMore()
                            }
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = colors.accent,
                                    strokeWidth = 2.dp
                                )
                            }
                        }
                    }
                }
            }
        }

        // Reply/Edit indicator
        AnimatedVisibility(visible = state.replyTo != null || state.editingMessage != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceVariant)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = if (state.editingMessage != null) Icons.Default.Edit
                        else Icons.AutoMirrored.Filled.Reply,
                    contentDescription = null,
                    tint = colors.accent,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (state.editingMessage != null) "Редактирование"
                            else (state.replyTo?.senderName ?: ""),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.accent
                    )
                    Text(
                        text = (state.editingMessage ?: state.replyTo)?.text ?: "",
                        fontSize = 13.sp,
                        color = colors.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = {
                    if (state.editingMessage != null) viewModel.cancelEditing()
                    else viewModel.setReplyTo(null)
                }) {
                    Icon(Icons.Default.Close, "Закрыть", tint = colors.onSurfaceVariant)
                }
            }
        }

        // Input
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.surface)
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { /* TODO: файл */ }) {
                Icon(Icons.Default.AttachFile, "Файл", tint = colors.onSurfaceVariant)
            }

            OutlinedTextField(
                value = state.inputText,
                onValueChange = viewModel::updateInput,
                placeholder = { Text("Сообщение...", color = colors.onSurfaceVariant) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                maxLines = 5,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { viewModel.sendMessage() }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = colors.accent,
                    unfocusedBorderColor = colors.surfaceVariant,
                    cursorColor = colors.accent,
                    focusedContainerColor = colors.surfaceVariant.copy(alpha = 0.5f),
                    unfocusedContainerColor = colors.surfaceVariant.copy(alpha = 0.3f)
                )
            )

            Spacer(Modifier.width(4.dp))

            IconButton(
                onClick = viewModel::sendMessage,
                enabled = state.inputText.isNotBlank() && !state.isSending
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    "Отправить",
                    tint = if (state.inputText.isNotBlank()) colors.accent
                        else colors.onSurfaceVariant
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageBubble(
    message: Message,
    isOwn: Boolean,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReact: (String) -> Unit
) {
    val colors = ShadowTheme.colors
    var showMenu by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isOwn) Alignment.End else Alignment.Start
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier.widthIn(max = 320.dp)
        ) {
            // Avatar (for others)
            if (!isOwn) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(parseAvatarColor(message.senderAvatarColor)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = message.senderName.take(1).uppercase(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
                Spacer(Modifier.width(8.dp))
            }

            // Bubble
            Card(
                shape = RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isOwn) 16.dp else 4.dp,
                    bottomEnd = if (isOwn) 4.dp else 16.dp
                ),
                colors = CardDefaults.cardColors(
                    containerColor = if (isOwn) colors.accent.copy(alpha = 0.85f)
                        else colors.card
                ),
                modifier = Modifier.clickable { showMenu = true }
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    // Sender name (groups)
                    if (!isOwn) {
                        Text(
                            text = message.senderName,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isOwn) Color.White.copy(alpha = 0.8f)
                                else colors.accent
                        )
                        Spacer(Modifier.height(2.dp))
                    }

                    // Reply preview
                    if (message.replyTo != null) {
                        Row(
                            modifier = Modifier
                                .background(
                                    color = if (isOwn) Color.White.copy(alpha = 0.1f)
                                        else colors.surfaceVariant,
                                    shape = RoundedCornerShape(4.dp)
                                )
                                .padding(6.dp)
                        ) {
                            Box(
                                Modifier
                                    .width(3.dp)
                                    .height(24.dp)
                                    .background(colors.accent, RoundedCornerShape(2.dp))
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "↩ Ответ",
                                fontSize = 11.sp,
                                color = colors.onSurfaceVariant
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                    }

                    // Message text
                    when (message.type) {
                        "text" -> Text(
                            text = message.text,
                            fontSize = 14.sp,
                            color = if (isOwn) Color.White else colors.onSurface,
                            lineHeight = 20.sp
                        )
                        "image" -> Text(
                            text = "📷 Фото",
                            color = if (isOwn) Color.White else colors.onSurface
                        )
                        "file" -> Text(
                            text = "📎 ${message.fileName ?: "Файл"}",
                            color = if (isOwn) Color.White else colors.onSurface
                        )
                        "voice" -> Text(
                            text = "🎤 Голосовое сообщение",
                            color = if (isOwn) Color.White else colors.onSurface
                        )
                    }

                    // Time + edited
                    Row(
                        modifier = Modifier
                            .align(Alignment.End)
                            .padding(top = 4.dp)
                    ) {
                        if (message.editedAt != null) {
                            Text(
                                "ред. ",
                                fontSize = 10.sp,
                                color = if (isOwn) Color.White.copy(alpha = 0.6f)
                                    else colors.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                        }
                        Text(
                            text = formatMessageTime(message.timestamp),
                            fontSize = 10.sp,
                            color = if (isOwn) Color.White.copy(alpha = 0.6f)
                                else colors.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                    }

                    // Reactions
                    if (message.reactions.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            message.reactions.forEach { (emoji, users) ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (isOwn) Color.White.copy(alpha = 0.2f)
                                        else colors.surfaceVariant,
                                    onClick = { onReact(emoji) }
                                ) {
                                    Text(
                                        text = "$emoji ${users.size}",
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        fontSize = 12.sp,
                                        color = if (isOwn) Color.White else colors.onSurface
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Context menu
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false }
        ) {
            DropdownMenuItem(
                text = { Text("Ответить") },
                leadingIcon = { Icon(Icons.AutoMirrored.Filled.Reply, null) },
                onClick = { onReply(); showMenu = false }
            )
            if (isOwn) {
                DropdownMenuItem(
                    text = { Text("Редактировать") },
                    leadingIcon = { Icon(Icons.Default.Edit, null) },
                    onClick = { onEdit(); showMenu = false }
                )
                DropdownMenuItem(
                    text = { Text("Удалить", color = MaterialTheme.colorScheme.error) },
                    leadingIcon = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
                    onClick = { onDelete(); showMenu = false }
                )
            }
            // Quick reactions
            DropdownMenuItem(
                text = {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("👍", "❤️", "😂", "😮", "😢", "🔥").forEach { emoji ->
                            Text(
                                text = emoji,
                                fontSize = 20.sp,
                                modifier = Modifier.clickable {
                                    onReact(emoji)
                                    showMenu = false
                                }
                            )
                        }
                    }
                },
                onClick = {}
            )
        }
    }
}

fun formatMessageTime(timestamp: String): String {
    return try {
        val instant = java.time.Instant.parse(timestamp)
        val local = java.time.LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault())
        "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
    } catch (_: Exception) {
        ""
    }
}
