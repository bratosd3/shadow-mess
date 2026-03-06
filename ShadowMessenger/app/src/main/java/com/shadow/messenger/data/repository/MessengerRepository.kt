package com.shadow.messenger.data.repository

import com.shadow.messenger.data.local.*
import com.shadow.messenger.data.remote.ApiService
import com.shadow.messenger.data.remote.AuthInterceptor
import com.shadow.messenger.data.remote.SocketManager
import com.shadow.messenger.domain.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MessengerRepository @Inject constructor(
    private val api: ApiService,
    private val db: AppDatabase,
    private val prefs: PrefsRepository,
    private val socketManager: SocketManager,
    private val authInterceptor: AuthInterceptor
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    // ── Auth ──────────────────────────────────────────────────────────
    suspend fun login(username: String, password: String): Result<User> {
        return try {
            val response = api.login(LoginRequest(username, password))
            if (response.isSuccessful) {
                val body = response.body()!!
                authInterceptor.token = body.token
                prefs.saveAuth(body.token, body.user.id)
                connectSocket()
                Result.success(body.user)
            } else {
                Result.failure(Exception("Ошибка входа"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(username: String, displayName: String, password: String): Result<User> {
        return try {
            val response = api.register(RegisterRequest(username, displayName, password))
            if (response.isSuccessful) {
                val body = response.body()!!
                authInterceptor.token = body.token
                prefs.saveAuth(body.token, body.user.id)
                connectSocket()
                Result.success(body.user)
            } else {
                Result.failure(Exception("Ошибка регистрации"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        socketManager.disconnect()
        authInterceptor.token = null
        prefs.clearAuth()
        db.chatDao().clear()
        db.messageDao().clear()
        db.userDao().clear()
    }

    suspend fun restoreSession(): Boolean {
        val token = prefs.getToken() ?: return false
        authInterceptor.token = token
        return try {
            val response = api.getMe()
            if (response.isSuccessful) {
                connectSocket()
                true
            } else {
                prefs.clearAuth()
                authInterceptor.token = null
                false
            }
        } catch (e: Exception) {
            // Оффлайн — сессия может быть валидна
            true
        }
    }

    private suspend fun connectSocket() {
        val baseUrl = prefs.getBaseUrl()
        val token = prefs.getToken() ?: return
        socketManager.connect(baseUrl, token)
    }

    // ── Profile ───────────────────────────────────────────────────────
    suspend fun getMe(): Result<User> {
        return try {
            val response = api.getMe()
            if (response.isSuccessful) Result.success(response.body()!!)
            else Result.failure(Exception("Ошибка загрузки профиля"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateProfile(request: ProfileUpdateRequest): Result<User> {
        return try {
            val response = api.updateProfile(request)
            if (response.isSuccessful) Result.success(response.body()!!)
            else Result.failure(Exception("Ошибка обновления профиля"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Chats ─────────────────────────────────────────────────────────
    suspend fun loadChats(): Result<List<Chat>> {
        return try {
            val response = api.getChats()
            if (response.isSuccessful) {
                val chats = response.body()!!
                // Cache in Room
                db.chatDao().insertAll(chats.map { it.toEntity() })
                Result.success(chats)
            } else {
                Result.failure(Exception("Ошибка загрузки чатов"))
            }
        } catch (e: Exception) {
            // Return cached data
            val cached = db.chatDao().getAll().map { it.toChat() }
            if (cached.isNotEmpty()) Result.success(cached)
            else Result.failure(e)
        }
    }

    fun observeChats(): Flow<List<Chat>> {
        return db.chatDao().getAllFlow().map { entities ->
            entities.map { it.toChat() }
        }
    }

    suspend fun createPrivateChat(userId: String): Result<Chat> {
        return try {
            val response = api.createPrivateChat(CreateChatRequest(userId))
            if (response.isSuccessful) {
                val chat = response.body()!!
                db.chatDao().insert(chat.toEntity())
                Result.success(chat)
            } else Result.failure(Exception("Ошибка создания чата"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createGroup(name: String, members: List<String>): Result<Chat> {
        return try {
            val response = api.createGroup(CreateGroupRequest(name, members))
            if (response.isSuccessful) {
                val chat = response.body()!!
                db.chatDao().insert(chat.toEntity())
                Result.success(chat)
            } else Result.failure(Exception("Ошибка создания группы"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Messages ──────────────────────────────────────────────────────
    suspend fun loadMessages(chatId: String, before: String? = null): Result<List<Message>> {
        return try {
            val response = api.getMessages(chatId, before)
            if (response.isSuccessful) {
                val messages = response.body()!!
                db.messageDao().insertAll(messages.map { it.toEntity() })
                Result.success(messages)
            } else Result.failure(Exception("Ошибка загрузки сообщений"))
        } catch (e: Exception) {
            val cached = db.messageDao().getMessagesByChat(chatId).map { it.toMessage() }
            if (cached.isNotEmpty()) Result.success(cached)
            else Result.failure(e)
        }
    }

    fun observeMessages(chatId: String): Flow<List<Message>> {
        return db.messageDao().getMessagesByChatFlow(chatId).map { entities ->
            entities.map { it.toMessage() }
        }
    }

    suspend fun sendMessage(chatId: String, text: String, replyTo: String? = null): Result<Message> {
        return try {
            val response = api.sendMessage(chatId, SendMessageRequest(text, replyTo = replyTo))
            if (response.isSuccessful) {
                val msg = response.body()!!
                db.messageDao().insert(msg.toEntity())
                Result.success(msg)
            } else Result.failure(Exception("Ошибка отправки"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun editMessage(messageId: String, newText: String): Result<Message> {
        return try {
            val response = api.editMessage(messageId, mapOf("text" to newText))
            if (response.isSuccessful) {
                val msg = response.body()!!
                db.messageDao().insert(msg.toEntity())
                Result.success(msg)
            } else Result.failure(Exception("Ошибка редактирования"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteMessage(messageId: String): Result<Unit> {
        return try {
            val response = api.deleteMessage(messageId)
            if (response.isSuccessful) {
                db.messageDao().deleteById(messageId)
                Result.success(Unit)
            } else Result.failure(Exception("Ошибка удаления"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reactToMessage(messageId: String, emoji: String): Result<Message> {
        return try {
            val response = api.reactToMessage(messageId, mapOf("emoji" to emoji))
            if (response.isSuccessful) Result.success(response.body()!!)
            else Result.failure(Exception("Ошибка реакции"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Users ─────────────────────────────────────────────────────────
    suspend fun searchUsers(query: String): Result<List<User>> {
        return try {
            val response = api.searchUsers(query)
            if (response.isSuccessful) Result.success(response.body()!!)
            else Result.failure(Exception("Ошибка поиска"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ── Socket events ─────────────────────────────────────────────────
    fun socket() = socketManager

    // ── Mappers ───────────────────────────────────────────────────────
    private fun Chat.toEntity() = ChatEntity(
        id = id, type = type, name = name, description = description,
        avatar = avatar, avatarColor = avatarColor, createdAt = createdAt,
        pinned = pinned, muted = muted, archived = archived,
        membersJson = json.encodeToString(members),
        lastMessageJson = lastMessage?.let { json.encodeToString(it) },
        unreadCount = unreadCount,
        otherUserJson = otherUser?.let { json.encodeToString(it) },
        updatedAt = System.currentTimeMillis()
    )

    private fun ChatEntity.toChat() = Chat(
        id = id, type = type, name = name, description = description,
        avatar = avatar, avatarColor = avatarColor, createdAt = createdAt,
        pinned = pinned, muted = muted, archived = archived,
        members = try { json.decodeFromString(membersJson) } catch (_: Exception) { emptyList() },
        lastMessage = lastMessageJson?.let {
            try { json.decodeFromString(it) } catch (_: Exception) { null }
        },
        unreadCount = unreadCount,
        otherUser = otherUserJson?.let {
            try { json.decodeFromString(it) } catch (_: Exception) { null }
        }
    )

    private fun Message.toEntity() = MessageEntity(
        id = id, chatId = chatId, senderId = senderId, senderName = senderName,
        senderAvatar = senderAvatar, senderAvatarColor = senderAvatarColor,
        senderSuperUser = senderSuperUser, type = type, text = text,
        fileName = fileName, fileSize = fileSize, fileUrl = fileUrl,
        fileMime = fileMime, duration = duration, timestamp = timestamp,
        editedAt = editedAt, replyTo = replyTo, forwardFrom = forwardFrom,
        reactionsJson = json.encodeToString(reactions),
        readByJson = json.encodeToString(readBy)
    )

    private fun MessageEntity.toMessage() = Message(
        id = id, chatId = chatId, senderId = senderId, senderName = senderName,
        senderAvatar = senderAvatar, senderAvatarColor = senderAvatarColor,
        senderSuperUser = senderSuperUser, type = type, text = text,
        fileName = fileName, fileSize = fileSize, fileUrl = fileUrl,
        fileMime = fileMime, duration = duration, timestamp = timestamp,
        editedAt = editedAt, replyTo = replyTo, forwardFrom = forwardFrom,
        reactions = try { json.decodeFromString(reactionsJson) } catch (_: Exception) { emptyMap() },
        readBy = try { json.decodeFromString(readByJson) } catch (_: Exception) { emptyList() }
    )
}
