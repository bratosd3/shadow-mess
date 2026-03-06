package com.shadow.messenger.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shadow.messenger.data.repository.MessengerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthState(
    val isLogin: Boolean = true,
    val username: String = "",
    val displayName: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repository: MessengerRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state

    fun toggleMode() {
        _state.update { it.copy(isLogin = !it.isLogin, error = null) }
    }

    fun updateUsername(value: String) {
        _state.update { it.copy(username = value, error = null) }
    }

    fun updateDisplayName(value: String) {
        _state.update { it.copy(displayName = value, error = null) }
    }

    fun updatePassword(value: String) {
        _state.update { it.copy(password = value, error = null) }
    }

    fun updateConfirmPassword(value: String) {
        _state.update { it.copy(confirmPassword = value, error = null) }
    }

    fun submit() {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Заполните все поля") }
            return
        }
        if (!s.isLogin && s.password != s.confirmPassword) {
            _state.update { it.copy(error = "Пароли не совпадают") }
            return
        }
        if (!s.isLogin && s.displayName.isBlank()) {
            _state.update { it.copy(error = "Введите отображаемое имя") }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val result = if (s.isLogin) {
                repository.login(s.username.trim().lowercase(), s.password)
            } else {
                repository.register(s.username.trim().lowercase(), s.displayName.trim(), s.password)
            }
            result.fold(
                onSuccess = { _state.update { it.copy(isLoading = false, isSuccess = true) } },
                onFailure = { e -> _state.update { it.copy(isLoading = false, error = e.message ?: "Ошибка") } }
            )
        }
    }
}
