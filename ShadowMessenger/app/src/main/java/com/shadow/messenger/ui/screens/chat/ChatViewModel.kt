package com.shadow.messenger.ui.screens.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shadow.messenger.data.repository.MessengerRepository
import com.shadow.messenger.domain.model.Message
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class ChatState(
    val messages: List<Message> = emptyList(),
    val inputText: String = "",
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val replyTo: Message? = null,
    val editingMessage: Message? = null,
    val typingUsers: Set<String> = emptySet(),
    val hasMore: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repository: MessengerRepository
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private val _state = MutableStateFlow(ChatState())
    val state: StateFlow<ChatState> = _state

    private var currentChatId: String? = null

    fun loadChat(chatId: String) {
        if (currentChatId == chatId) return
        currentChatId = chatId
        _state.value = ChatState()

        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.loadMessages(chatId).fold(
                onSuccess = { messages ->
                    _state.update {
                        it.copy(
                            messages = messages,
                            isLoading = false,
                            hasMore = messages.size >= 50
                        )
                    }
                },
                onFailure = { e ->
                    _state.update { it.copy(isLoading = false, error = e.message) }
                }
            )
        }

        // Observe cached messages
        viewModelScope.launch {
            repository.observeMessages(chatId).collect { messages ->
                _state.update { it.copy(messages = messages) }
            }
        }

        // Socket events
        observeSocketEvents(chatId)
    }

    private fun observeSocketEvents(chatId: String) {
        val socket = repository.socket()
        socket.joinChat(chatId)
        socket.markRead(chatId)

        viewModelScope.launch {
            socket.onNewMessage().collect { jsonObj ->
                try {
                    val msgChatId = jsonObj.optString("chatId")
                    if (msgChatId == chatId) {
                        val msg = json.decodeFromString<Message>(jsonObj.toString())
                        _state.update { s ->
                            val updated = s.messages.toMutableList()
                            if (updated.none { it.id == msg.id }) {
                                updated.add(0, msg)
                            }
                            s.copy(messages = updated)
                        }
                        socket.markRead(chatId)
                    }
                } catch (_: Exception) {}
            }
        }

        viewModelScope.launch {
            socket.onMessageEdited().collect { jsonObj ->
                try {
                    val msg = json.decodeFromString<Message>(jsonObj.toString())
                    if (msg.chatId == chatId) {
                        _state.update { s ->
                            s.copy(messages = s.messages.map {
                                if (it.id == msg.id) msg else it
                            })
                        }
                    }
                } catch (_: Exception) {}
            }
        }

        viewModelScope.launch {
            socket.onMessageDeleted().collect { jsonObj ->
                val msgId = jsonObj.optString("messageId")
                _state.update { s ->
                    s.copy(messages = s.messages.filter { it.id != msgId })
                }
            }
        }

        viewModelScope.launch {
            socket.onTypingStart().collect { jsonObj ->
                val userId = jsonObj.optString("userId")
                val tChatId = jsonObj.optString("chatId")
                if (tChatId == chatId && userId.isNotEmpty()) {
                    _state.update { it.copy(typingUsers = it.typingUsers + userId) }
                    // Auto-remove after 3 seconds
                    kotlinx.coroutines.delay(3000)
                    _state.update { it.copy(typingUsers = it.typingUsers - userId) }
                }
            }
        }
    }

    fun updateInput(text: String) {
        _state.update { it.copy(inputText = text) }
        currentChatId?.let { chatId ->
            repository.socket().startTyping(chatId)
        }
    }

    fun sendMessage() {
        val text = _state.value.inputText.trim()
        if (text.isEmpty()) return

        val chatId = currentChatId ?: return

        // If editing
        val editing = _state.value.editingMessage
        if (editing != null) {
            viewModelScope.launch {
                repository.editMessage(editing.id, text)
                _state.update { it.copy(inputText = "", editingMessage = null) }
            }
            return
        }

        val replyToId = _state.value.replyTo?.id

        viewModelScope.launch {
            _state.update { it.copy(isSending = true) }
            repository.sendMessage(chatId, text, replyToId).fold(
                onSuccess = {
                    _state.update { it.copy(inputText = "", isSending = false, replyTo = null) }
                },
                onFailure = {
                    _state.update { it.copy(isSending = false) }
                }
            )
        }

        repository.socket().stopTyping(chatId)
    }

    fun setReplyTo(message: Message?) {
        _state.update { it.copy(replyTo = message, editingMessage = null) }
    }

    fun startEditing(message: Message) {
        _state.update { it.copy(editingMessage = message, inputText = message.text, replyTo = null) }
    }

    fun cancelEditing() {
        _state.update { it.copy(editingMessage = null, inputText = "") }
    }

    fun deleteMessage(messageId: String) {
        viewModelScope.launch {
            repository.deleteMessage(messageId)
        }
    }

    fun reactToMessage(messageId: String, emoji: String) {
        viewModelScope.launch {
            repository.reactToMessage(messageId, emoji)
        }
    }

    fun loadMore() {
        val chatId = currentChatId ?: return
        val messages = _state.value.messages
        if (messages.isEmpty() || !_state.value.hasMore) return

        val lastTimestamp = messages.last().timestamp

        viewModelScope.launch {
            repository.loadMessages(chatId, lastTimestamp).onSuccess { older ->
                _state.update {
                    it.copy(
                        messages = it.messages + older,
                        hasMore = older.size >= 50
                    )
                }
            }
        }
    }

    override fun onCleared() {
        currentChatId?.let { repository.socket().stopTyping(it) }
        super.onCleared()
    }
}
