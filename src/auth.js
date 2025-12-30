import { supabase } from './supabase.js'

// ========================================
// 状態管理
// ========================================
let isSignUp = false
let loading = false

// ========================================
// DOM要素
// ========================================
const authTitle = document.getElementById('auth-title')
const authForm = document.getElementById('auth-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const submitBtn = document.getElementById('submit-btn')
const toggleBtn = document.getElementById('toggle-btn')

// ========================================
// 初期化
// ========================================
async function init() {
    // 既にログイン済みならメイン画面へリダイレクト
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
        window.location.href = '/index.html'
        return
    }

    // イベントリスナー登録
    authForm.addEventListener('submit', handleAuth)
    toggleBtn.addEventListener('click', toggleMode)
}

// ========================================
// ログイン/サインアップ切り替え
// ========================================
function toggleMode() {
    isSignUp = !isSignUp
    updateUI()
}

function updateUI() {
    if (isSignUp) {
        authTitle.textContent = '新規登録 ✨'
        submitBtn.textContent = '新規登録'
        toggleBtn.textContent = 'すでにアカウントをお持ちの方'
    } else {
        authTitle.textContent = 'ログイン 🔐'
        submitBtn.textContent = 'ログイン'
        toggleBtn.textContent = '新規登録はこちら'
    }
}

// ========================================
// 認証処理
// ========================================
async function handleAuth(e) {
    e.preventDefault()

    if (loading) return

    const email = emailInput.value.trim()
    const password = passwordInput.value

    try {
        loading = true
        submitBtn.textContent = '処理中...'
        submitBtn.disabled = true

        if (isSignUp) {
            // サインアップ
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            })

            if (error) throw error

            alert('確認メールを送信したよ！メールをチェックしてね！📧✨')
        } else {
            // ログイン
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            })

            if (error) throw error

            // ログイン成功 → メイン画面へリダイレクト
            window.location.href = '/index.html'
        }
    } catch (error) {
        alert('エラー: ' + error.message)
    } finally {
        loading = false
        submitBtn.disabled = false
        updateUI()
    }
}

// ========================================
// 実行
// ========================================
init()
