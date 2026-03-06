package com.shadow.messenger.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String = "",
    val username: String = "",
    val displayName: String = "",
    val avatar: String? = null,
    val avatarColor: String? = null,
    val bio: String = "",
    val phone: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val superUser: Boolean = false,
    val online: Boolean = false,
    val lastSeen: String? = null,
    val createdAt: String? = null,
    val settings: UserSettings? = null
)

@Serializable
data class UserSettings(
    val theme: String = "light",
    val fontSize: Int = 14,
    val notifications: Boolean = true,
    val soundEnabled: Boolean = true,
    val notifCalls: Boolean = true,
    val notifMentions: Boolean = true,
    val notifPreview: Boolean = true,
    val privShowLastSeen: Boolean = true,
    val privShowOnline: Boolean = true,
    val privShowAvatar: Boolean = true,
    val privAllowForward: Boolean = true,
    val privReadReceipts: Boolean = true,
    val privShowTyping: Boolean = true,
    val language: String = "ru",
    val accentColor: String = "",
    val bubbleStyle: String = "rounded",
    val compactMode: Boolean = false,
    val chatWallpaper: String = "dots",
    val sendByEnter: Boolean = true
)

@Serializable
data class Chat(
    val id: String = "",
    val type: String = "private",
    val members: List<String> = emptyList(),
    val name: String? = null,
    val description: String = "",
    val avatar: String? = null,
    val avatarColor: String? = null,
    val createdAt: String? = null,
    val createdBy: String? = null,
    val admins: List<String> = emptyList(),
    val pinned: Boolean = false,
    val muted: Boolean = false,
    val archived: Boolean = false,
    val pinnedMessage: String? = null,
    // Дополнительные поля от API
    val lastMessage: Message? = null,
    val unreadCount: Int = 0,
    val otherUser: User? = null
)

@Serializable
data class Message(
    val id: String = "",
    val chatId: String = "",
    val senderId: String = "",
    val senderName: String = "",
    val senderAvatar: String? = null,
    val senderAvatarColor: String? = null,
    val senderSuperUser: Boolean = false,
    val type: String = "text",
    val text: String = "",
    val fileName: String? = null,
    val fileSize: Long? = null,
    val fileUrl: String? = null,
    val fileMime: String? = null,
    val duration: Double? = null,
    val timestamp: String = "",
    val editedAt: String? = null,
    val replyTo: String? = null,
    val forwardFrom: String? = null,
    val reactions: Map<String, List<String>> = emptyMap(),
    val readBy: List<String> = emptyList()
)

@Serializable
data class AuthResponse(
    val token: String,
    val user: User
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val device: String = "Android"
)

@Serializable
data class RegisterRequest(
    val username: String,
    val displayName: String,
    val password: String,
    val device: String = "Android"
)

@Serializable
data class CreateChatRequest(
    val userId: String
)

@Serializable
data class CreateGroupRequest(
    val name: String,
    val members: List<String>
)

@Serializable
data class SendMessageRequest(
    val text: String,
    val type: String = "text",
    val replyTo: String? = null
)

@Serializable
data class ApiError(
    val error: String
)

@Serializable
data class UserSearchResult(
    val users: List<User> = emptyList()
)

@Serializable
data class ChatsResponse(
    val chats: List<Chat> = emptyList()
)

@Serializable
data class MessagesResponse(
    val messages: List<Message> = emptyList()
)

@Serializable
data class ProfileUpdateRequest(
    val displayName: String? = null,
    val bio: String? = null,
    val phone: String? = null,
    val firstName: String? = null,
    val lastName: String? = null
)

@Serializable
data class SettingsUpdateRequest(
    val settings: UserSettings
)
