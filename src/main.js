import { supabase } from './supabase.js'

// ========================================
// 状態管理
// ========================================
let session = null
let teamId = null
let tasks = []
let members = []
let projects = []
let undoStack = []
let editingTask = null
let editAssignees = []
let currentProject = null

const UNDO_STACK_MAX_SIZE = 10
const TIME_FRAMES = ['今日', '明日', '今週', '来週', '来月以降']
const PROJECT_COLORS = ['#FF69B4', '#FFB6C1', '#87CEEB', '#4682B4', '#90EE90', '#32CD32', '#FFD700', '#FFA500', '#D3D3D3', '#A9A9A9']

// 新規タスク用データ
let newTaskData = {
  task_name: '',
  memo: '',
  due_date: '',
  due_time: '',
  priority_time_frame: '今日',
  is_important: false,
  is_pinned: false,
  assignees: []
}

// プロジェクト作成用データ
let newProjectData = {
  project_name: '',
  description: '',
  color_code: '#FF69B4'
}

// プロジェクト設定用データ
let editingProject = null
let editProjectColor = '#FF69B4'

// ドラッグ&ドロップ用
let draggedTask = null
let dragOverElement = null
// メンバー管理用
let editingMember = null
let newMemberColor = '#FF69B4'
let editMemberColor = '#FF69B4'

// レポート用
let reportTasks = []

// アーカイブ用
let archivedProjects = []

// PWA用
let isPWA = false
let isOnline = navigator.onLine
let swipedTaskId = null
let swipeDirection = null
let touchStartX = 0
let touchCurrentX = 0
let isSwiping = false
// ========================================
// 初期化
// ========================================
async function init() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()

  if (!currentSession) {
    window.location.href = '/auth.html'
    return
  }

  session = currentSession
  console.log('ログイン済み:', session.user.email)

  await fetchTeamId()
  await fetchMembers()
  await fetchProjects()

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) {
      window.location.href = '/auth.html'
    }
    session = newSession
  })

  // 🔧 修正：先にrenderAppでDOMを生成
  renderApp()
  renderProjectTabs()

  // 🔧 修正：DOM生成後にPWA判定
  checkPWAMode()
  setupPWAListeners()

  await fetchTasks()
  setupEventListeners()
  setupUndoListener()
  generateTimeOptions()
}
// ========================================
// チームID取得
// ========================================
async function fetchTeamId() {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', session.user.id)
    .single()

  if (error) {
    console.error('チームID取得エラー:', error.message)
    return
  }

  teamId = data.team_id
  console.log('チームID:', teamId)
}

// ========================================
// メンバー取得
// ========================================
async function fetchMembers() {
  if (!teamId) return

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('team_id', teamId)

  if (error) {
    console.error('メンバー取得エラー:', error.message)
    return
  }

  members = data || []
  console.log('メンバー:', members)
}

// ========================================
// プロジェクト取得
// ========================================
async function fetchProjects() {
  if (!teamId) return

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_archived', false)
    .eq('is_completed', false)

  if (error) {
    console.error('プロジェクト取得エラー:', error.message)
    return
  }

  projects = data || []
  console.log('プロジェクト:', projects)
}

// ========================================
// タスク取得
// ========================================
async function fetchTasks() {
  if (!teamId) return

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_completed', false)

  // 🆕 追加：プロジェクトフィルタリング
  if (currentProject) {
    query = query.eq('project_id', currentProject)
  }

  const { data, error } = await query

  if (error) {
    console.error('タスク取得エラー:', error.message)
    return
  }

  tasks = (data || []).sort((a, b) => {
    return (a.sort_order || 0) - (b.sort_order || 0)
  })

  console.log('タスク:', tasks)
  renderTaskList()
}
// ========================================
// 更新ボタン処理
// ========================================
async function handleRefresh() {
  const btn = document.getElementById('refresh-btn')
  const originalText = btn.innerHTML

  btn.innerHTML = '🔄 更新中...'
  btn.disabled = true

  await fetchProjects()
  renderProjectTabs()
  await fetchTasks()

  btn.innerHTML = '✅ 更新完了！'

  setTimeout(() => {
    btn.innerHTML = originalText
    btn.disabled = false
  }, 1000)
}

// ========================================
// メイン画面表示
// ========================================
function renderApp() {
  const app = document.getElementById('app')
  const template = document.getElementById('main-template')
  app.innerHTML = ''
  app.appendChild(template.content.cloneNode(true))
}

// ========================================
// タスク一覧表示
// ========================================
function renderTaskList() {
  const container = document.getElementById('task-list')
  if (!container) return

  if (tasks.length === 0) {
    container.innerHTML = `
      <p class="task-empty-message">
        タスクがないよ！上から追加してね〜！✨
      </p>
    `
    return
  }

  // 時間枠ごとにグループ化
  const groupedTasks = TIME_FRAMES.reduce((acc, timeFrame) => {
    acc[timeFrame] = tasks.filter(task => task.priority_time_frame === timeFrame)
    return acc
  }, {})

  let html = ''

  TIME_FRAMES.forEach(timeFrame => {
    const frameTasks = groupedTasks[timeFrame]

    html += `
      <div class="timeframe-section" data-timeframe="${timeFrame}">
        <div class="timeframe-header">
          <span class="timeframe-label">${timeFrame}</span>
          <span class="timeframe-count">${frameTasks.length}</span>
        </div>
        <div class="timeframe-tasks" data-timeframe="${timeFrame}">
    `

    if (frameTasks.length === 0) {
      html += `<div class="task-dropzone-empty">ここにドロップ 👇</div>`
    } else {
      frameTasks.forEach(task => {
        html += renderTaskCard(task)
      })
    }

    html += `
        </div>
      </div>
    `
  })

  container.innerHTML = html

  // タスクカードのイベントリスナー
  setupTaskCardListeners()

  // ドラッグ&ドロップのイベントリスナー
  setupDragAndDrop()
}
// ========================================
// プロジェクトカラー取得
// ========================================
function getProjectColor(projectId) {
  if (!projectId) return null
  const project = projects.find(p => p.id === projectId)
  return project ? project.color_code : null
}
// ========================================
// タスクカード生成
// ========================================
// タスクカード生成
// ========================================
function renderTaskCard(task) {
  const { isOverdue, isTimeFrameMismatch } = checkTaskStatus(task)
  const hasWarning = isOverdue || isTimeFrameMismatch
  const assigneeList = getAssigneeNames(task.assignees)
  const projectColor = getProjectColor(task.project_id)

  // クラス名を構築
  let cardClasses = ['task-card']
  if (hasWarning) cardClasses.push('task-warning')
  if (task.is_pinned) cardClasses.push('task-pinned')
  if (task.is_important) cardClasses.push('task-important')

  let warningIcon = ''
  if (hasWarning) {
    const title = isOverdue
      ? '⚠️ 期日が過ぎています！'
      : '⚠️ 期日が近いのに遠い時間枠に入っています！'
    warningIcon = `<span class="task-warning-icon" title="${title}">🚨</span>`
  }

  // プロジェクトカラー丸
  let projectColorDot = ''
  if (projectColor) {
    projectColorDot = `<div class="task-project-color" style="background-color: ${projectColor}"></div>`
  }

  let assigneesHtml = ''
  if (assigneeList.length > 0) {
    assigneesHtml = `
      <div class="task-assignees">
        ${assigneeList.map(a => `
          <span class="task-assignee">
            <div class="assignee-color" style="background-color: ${a.color}"></div>
            ${escapeHtml(a.name)}
          </span>
        `).join('')}
      </div>
    `
  }

  let memoHtml = ''
  if (task.memo) {
    memoHtml = `<div class="task-memo">${escapeHtml(task.memo)}</div>`
  }

  let metaHtml = ''
  if (task.due_date) {
    const metaClass = hasWarning ? 'task-meta task-meta-warning' : 'task-meta'
    metaHtml = `<div class="${metaClass}">📅 ${task.due_date} ${task.due_time || ''}</div>`
  }

  // PWAモード時はスワイプ対応のHTML
  if (isPWA) {
    const isSwipedRight = swipedTaskId === task.id && swipeDirection === 'right'
    const isSwipedLeft = swipedTaskId === task.id && swipeDirection === 'left'
    const swipeClass = isSwipedRight ? 'swiped-right' : (isSwipedLeft ? 'swiped-left' : '')

    return `
      <div class="swipe-container" data-task-id="${task.id}">
        ${isSwipedRight ? `
          <div class="swipe-actions swipe-action-complete">
            <div class="swipe-action-content" data-action="swipe-complete">
              <span class="swipe-action-icon">✓</span>
              <span>完了</span>
            </div>
          </div>
        ` : ''}
        ${isSwipedLeft ? `
          <div class="swipe-actions swipe-action-delete">
            <div class="swipe-action-content" data-action="swipe-delete">
              <span class="swipe-action-icon">🗑</span>
              <span>削除</span>
            </div>
          </div>
        ` : ''}
        <div class="${cardClasses.join(' ')} swipe-card ${swipeClass}" data-task-id="${task.id}" draggable="false">
          <div class="task-card-content" data-action="open-detail">
            <div class="task-name">
              ${projectColorDot}
              ${warningIcon}
              ${escapeHtml(task.task_name)}
            </div>
            ${assigneesHtml}
            ${memoHtml}
            ${metaHtml}
          </div>
        </div>
      </div>
    `
  }

  // 通常モード
  return `
    <div class="${cardClasses.join(' ')}" data-task-id="${task.id}" draggable="true">
      <span class="icon-drag">☰</span>
      <span class="icon-pin ${task.is_pinned ? 'active' : 'inactive'}" data-action="toggle-pin" title="${task.is_pinned ? 'ピン留め解除' : 'ピン留め'}">📌</span>
      <span class="icon-star ${task.is_important ? 'active' : 'inactive'}" data-action="toggle-important" title="${task.is_important ? '重要マーク解除' : '重要マーク'}">${task.is_important ? '⭐' : '☆'}</span>
      <input type="checkbox" class="task-checkbox" data-action="toggle-complete" ${task.is_completed ? 'checked' : ''}>
      <div class="task-card-content" data-action="open-detail">
        <div class="task-name">
          ${projectColorDot}
          ${warningIcon}
          ${escapeHtml(task.task_name)}
        </div>
        ${assigneesHtml}
        ${memoHtml}
        ${metaHtml}
      </div>
      <button class="icon-delete" data-action="delete">削除</button>
    </div>
  `
}

// ========================================
// 期日切れ & 時間枠不一致チェック
// ========================================
function checkTaskStatus(task) {
  if (!task.due_date || task.is_completed) {
    return { isOverdue: false, isTimeFrameMismatch: false }
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const dueDateParts = task.due_date.split('-')
  const dueDate = new Date(
    parseInt(dueDateParts[0]),
    parseInt(dueDateParts[1]) - 1,
    parseInt(dueDateParts[2])
  )

  const isOverdue = dueDate < today

  let isTimeFrameMismatch = false

  if (task.priority_time_frame && task.due_date) {
    const daysDiff = Math.round((dueDate - today) / (1000 * 60 * 60 * 24))

    const timeFrameMinDays = {
      '今日': 0,
      '明日': 1,
      '今週': 3,
      '来週': 5,
      '来月以降': 10
    }

    const minDays = timeFrameMinDays[task.priority_time_frame]

    if (minDays !== undefined && daysDiff >= 0 && daysDiff < minDays) {
      isTimeFrameMismatch = true
    }
  }

  return { isOverdue, isTimeFrameMismatch }
}

// ========================================
// 担当者名を取得
// ========================================
function getAssigneeNames(assigneesJson) {
  try {
    const assigneeIds = JSON.parse(assigneesJson || '[]')
    if (assigneeIds.length === 0) return []

    return assigneeIds.map(id => {
      const member = members.find(m => m.id === id)
      return member ? { name: member.name, color: member.color } : null
    }).filter(Boolean)
  } catch (e) {
    return []
  }
}

// ========================================
// HTMLエスケープ
// ========================================
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ========================================
// イベントリスナー設定
// ========================================
function setupEventListeners() {
  // ログアウト
  document.getElementById('logout-btn').addEventListener('click', async () => {
    const confirmed = window.confirm('ログアウトしますか？')
    if (!confirmed) return
    await supabase.auth.signOut()
  })

  // タスク作成フォーム
  document.getElementById('task-create-form').addEventListener('submit', handleTaskInputSubmit)

  // 作成モーダル関連
  document.getElementById('modal-cancel').addEventListener('click', closeCreateModal)
  document.getElementById('modal-create').addEventListener('click', createTask)
  document.getElementById('modal-clear-date').addEventListener('click', clearDueDate)

  document.getElementById('modal-important').addEventListener('change', (e) => {
    const icon = document.getElementById('modal-important-icon')
    icon.textContent = e.target.checked ? '⭐' : '☆'
    newTaskData.is_important = e.target.checked
  })

  document.getElementById('modal-pinned').addEventListener('change', (e) => {
    newTaskData.is_pinned = e.target.checked
  })

  document.getElementById('modal-due-date').addEventListener('change', updateClearDateButton)
  document.getElementById('modal-due-time').addEventListener('change', updateClearDateButton)

  document.getElementById('modal-due-time').addEventListener('focus', (e) => {
    if (e.target.value === '') {
      e.target.value = '17:00'
      newTaskData.due_time = '17:00'
    }
  })

  document.getElementById('create-modal').addEventListener('click', (e) => {
    if (e.target.id === 'create-modal') {
      closeCreateModal()
    }
  })

  // 編集モーダル関連
  document.getElementById('edit-cancel').addEventListener('click', closeEditModal)
  document.getElementById('edit-save').addEventListener('click', saveTask)
  document.getElementById('edit-clear-date').addEventListener('click', clearEditDueDate)

  document.getElementById('edit-important').addEventListener('change', (e) => {
    const icon = document.getElementById('edit-important-icon')
    icon.textContent = e.target.checked ? '⭐' : '☆'
  })

  document.getElementById('edit-due-date').addEventListener('change', updateEditClearDateButton)
  document.getElementById('edit-due-time').addEventListener('change', updateEditClearDateButton)

  document.getElementById('edit-due-time').addEventListener('focus', (e) => {
    if (e.target.value === '') {
      e.target.value = '17:00'
    }
  })

  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') {
      closeEditModal()
    }
  })

  // プロジェクト設定ボタン
  document.getElementById('project-settings-btn').addEventListener('click', openProjectSettingsModal)

  // プロジェクト作成モーダル
  document.getElementById('project-create-cancel').addEventListener('click', closeProjectCreateModal)
  document.getElementById('project-create-submit').addEventListener('click', createProject)
  document.getElementById('project-create-modal').addEventListener('click', (e) => {
    if (e.target.id === 'project-create-modal') closeProjectCreateModal()
  })

  // プロジェクト設定モーダル
  document.getElementById('project-settings-cancel').addEventListener('click', closeProjectSettingsModal)
  document.getElementById('project-settings-save').addEventListener('click', saveProjectSettings)
  document.getElementById('project-complete-btn').addEventListener('click', completeProject)
  document.getElementById('project-archive-btn').addEventListener('click', archiveProject)
  document.getElementById('project-delete-btn').addEventListener('click', deleteProject)
  document.getElementById('project-settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'project-settings-modal') closeProjectSettingsModal()
  })

  // メンバー管理ボタン
  document.getElementById('member-btn').addEventListener('click', openMemberModal)
  document.getElementById('member-modal-close').addEventListener('click', closeMemberModal)
  document.getElementById('member-add-btn').addEventListener('click', addMember)
  document.getElementById('member-modal').addEventListener('click', (e) => {
    if (e.target.id === 'member-modal') closeMemberModal()
  })

  // メンバー編集モーダル
  document.getElementById('member-edit-cancel').addEventListener('click', closeMemberEditModal)
  document.getElementById('member-edit-save').addEventListener('click', saveMember)
  document.getElementById('member-edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'member-edit-modal') closeMemberEditModal()
  })

  // レポートボタン
  document.getElementById('report-btn').addEventListener('click', openReportModal)
  document.getElementById('report-modal-close').addEventListener('click', closeReportModal)
  document.getElementById('report-filter-btn').addEventListener('click', fetchReportData)  // 修正
  document.getElementById('report-modal').addEventListener('click', (e) => {
    if (e.target.id === 'report-modal') closeReportModal()
  })

  // 振り返り編集モーダル（新規追加）
  document.getElementById('report-edit-cancel').addEventListener('click', closeReportEditModal)
  document.getElementById('report-edit-save').addEventListener('click', saveReportTask)
  document.getElementById('report-edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'report-edit-modal') closeReportEditModal()
  })

  // 更新ボタン
  document.getElementById('refresh-btn').addEventListener('click', handleRefresh)

  // アーカイブボタン
  document.getElementById('archive-btn').addEventListener('click', openArchiveModal)
  document.getElementById('archive-modal-close').addEventListener('click', closeArchiveModal)
  document.getElementById('archive-modal').addEventListener('click', (e) => {
    if (e.target.id === 'archive-modal') closeArchiveModal()
  })
}
// ========================================
// タスクカードのイベントリスナー
// ========================================
function setupTaskCardListeners() {
  document.querySelectorAll('.task-card, .swipe-container').forEach(card => {
    const taskId = card.dataset.taskId

    // PWAモードのタッチイベント
    if (isPWA) {
      card.addEventListener('touchstart', (e) => handleTouchStart(e, taskId), { passive: true })
      card.addEventListener('touchmove', (e) => handleTouchMove(e, taskId), { passive: true })
      card.addEventListener('touchend', (e) => handleTouchEnd(e, taskId))
    }

    card.addEventListener('click', (e) => {
      const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action

      // PWAスワイプアクション
      if (action === 'swipe-complete') {
        e.stopPropagation()
        handleSwipeComplete(taskId)
        return
      }
      if (action === 'swipe-delete') {
        e.stopPropagation()
        handleSwipeDelete(taskId)
        return
      }

      // PWAモードでスワイプが開いている場合は閉じる
      if (isPWA && swipedTaskId === taskId) {
        closeSwipe()
        renderTaskList()
        return
      }

      if (action === 'toggle-pin') {
        e.stopPropagation()
        const task = tasks.find(t => t.id === taskId)
        if (task) togglePin(taskId, task.is_pinned)
      } else if (action === 'toggle-important') {
        e.stopPropagation()
        const task = tasks.find(t => t.id === taskId)
        if (task) toggleImportant(taskId, task.is_important)
      } else if (action === 'toggle-complete') {
        e.stopPropagation()
        const task = tasks.find(t => t.id === taskId)
        if (task) toggleComplete(taskId, task.is_completed)
      } else if (action === 'delete') {
        e.stopPropagation()
        deleteTask(taskId)
      } else if (action === 'open-detail') {
        const task = tasks.find(t => t.id === taskId)
        if (task) openEditModal(task)
      }
    })
  })
}

// ========================================
// タスク作成フォーム送信
// ========================================
function handleTaskInputSubmit(e) {
  e.preventDefault()
  const input = document.getElementById('new-task-input')
  const taskName = input.value.trim()

  if (!taskName) return

  newTaskData = {
    task_name: taskName,
    memo: '',
    due_date: '',
    due_time: '',
    priority_time_frame: '今日',
    is_important: false,
    is_pinned: false,
    assignees: []
  }

  openCreateModal()
}

// ========================================
// 作成モーダル表示
// ========================================
function openCreateModal() {
  const modal = document.getElementById('create-modal')

  document.getElementById('modal-task-name').value = newTaskData.task_name
  document.getElementById('modal-memo').value = newTaskData.memo
  document.getElementById('modal-time-frame').value = newTaskData.priority_time_frame
  document.getElementById('modal-due-date').value = newTaskData.due_date
  document.getElementById('modal-due-time').value = newTaskData.due_time
  document.getElementById('modal-important').checked = newTaskData.is_important
  document.getElementById('modal-important-icon').textContent = newTaskData.is_important ? '⭐' : '☆'
  document.getElementById('modal-pinned').checked = newTaskData.is_pinned

  renderCreateAssigneeSelection()
  updateClearDateButton()

  modal.classList.remove('hidden')
}

// ========================================
// 作成モーダル非表示
// ========================================
function closeCreateModal() {
  const modal = document.getElementById('create-modal')
  modal.classList.add('hidden')
  document.getElementById('new-task-input').value = ''
}

// ========================================
// 作成モーダル担当者選択を生成
// ========================================
function renderCreateAssigneeSelection() {
  const container = document.getElementById('modal-assignees')

  if (members.length === 0) {
    container.innerHTML = '<p class="no-members-message">メンバーがいません</p>'
    return
  }

  container.innerHTML = members.map(member => `
    <label class="assignee-option ${newTaskData.assignees.includes(member.id) ? 'selected' : ''}" data-member-id="${member.id}">
      <div class="assignee-color" style="background-color: ${member.color}"></div>
      ${escapeHtml(member.name)}
    </label>
  `).join('')

  container.querySelectorAll('.assignee-option').forEach(option => {
    option.addEventListener('click', () => {
      const memberId = option.dataset.memberId
      if (newTaskData.assignees.includes(memberId)) {
        newTaskData.assignees = newTaskData.assignees.filter(id => id !== memberId)
        option.classList.remove('selected')
      } else {
        newTaskData.assignees.push(memberId)
        option.classList.add('selected')
      }
    })
  })
}

// ========================================
// 期日クリアボタン表示更新（作成モーダル）
// ========================================
function updateClearDateButton() {
  const dueDate = document.getElementById('modal-due-date').value
  const dueTime = document.getElementById('modal-due-time').value
  const clearBtn = document.getElementById('modal-clear-date')

  if (dueDate || dueTime) {
    clearBtn.classList.remove('hidden')
  } else {
    clearBtn.classList.add('hidden')
  }
}

// ========================================
// 期日クリア（作成モーダル）
// ========================================
function clearDueDate() {
  document.getElementById('modal-due-date').value = ''
  document.getElementById('modal-due-time').value = ''
  newTaskData.due_date = ''
  newTaskData.due_time = ''
  updateClearDateButton()
}

// ========================================
// 時間選択肢を生成
// ========================================
function generateTimeOptions() {
  const selects = [
    document.getElementById('modal-due-time'),
    document.getElementById('edit-due-time')
  ]

  selects.forEach(select => {
    for (let i = 0; i < 48; i++) {
      const hour = Math.floor(i / 2)
      const minute = (i % 2) * 30
      const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const option = document.createElement('option')
      option.value = timeValue
      option.textContent = timeValue
      select.appendChild(option)
    }
  })
}

// ========================================
// タスク作成
// ========================================
async function createTask() {
  const taskName = document.getElementById('modal-task-name').value.trim()
  if (!taskName) return

  const taskData = {
    team_id: teamId,
    task_name: taskName,
    memo: document.getElementById('modal-memo').value,
    project_id: currentProject || null, // 🆕 修正：現在のプロジェクトに紐付け
    is_completed: false,
    priority_time_frame: document.getElementById('modal-time-frame').value,
    is_important: document.getElementById('modal-important').checked,
    is_pinned: document.getElementById('modal-pinned').checked,
    due_date: document.getElementById('modal-due-date').value || null,
    due_time: document.getElementById('modal-due-time').value || null,
    assignees: JSON.stringify(newTaskData.assignees),
    sort_order: tasks.length
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('タスク作成したよ！✨')
  closeCreateModal()
  await fetchTasks()
}
// ========================================
// 編集モーダル表示
// ========================================
function openEditModal(task) {
  editingTask = task
  editAssignees = []

  try {
    editAssignees = JSON.parse(task.assignees || '[]')
  } catch (e) {
    editAssignees = []
  }

  const modal = document.getElementById('edit-modal')

  document.getElementById('edit-task-name').value = task.task_name
  document.getElementById('edit-memo').value = task.memo || ''
  document.getElementById('edit-time-frame').value = task.priority_time_frame || '今日'
  document.getElementById('edit-due-date').value = task.due_date || ''
  document.getElementById('edit-due-time').value = task.due_time || ''
  document.getElementById('edit-important').checked = task.is_important || false
  document.getElementById('edit-important-icon').textContent = task.is_important ? '⭐' : '☆'
  document.getElementById('edit-pinned').checked = task.is_pinned || false

  // プロジェクト選択肢を生成
  renderEditProjectSelection(task.project_id)

  // 担当者選択を生成
  renderEditAssigneeSelection()

  // クリアボタン表示更新
  updateEditClearDateButton()

  modal.classList.remove('hidden')
}

// ========================================
// 編集モーダル非表示
// ========================================
function closeEditModal() {
  const modal = document.getElementById('edit-modal')
  modal.classList.add('hidden')
  editingTask = null
  editAssignees = []
}

// ========================================
// プロジェクト選択を生成（編集モーダル）
// ========================================
function renderEditProjectSelection(currentProjectId) {
  const select = document.getElementById('edit-project')

  select.innerHTML = '<option value="">プロジェクトなし</option>'

  projects.forEach(project => {
    const option = document.createElement('option')
    option.value = project.id
    option.textContent = project.project_name
    if (project.id === currentProjectId) {
      option.selected = true
    }
    select.appendChild(option)
  })
}

// ========================================
// 担当者選択を生成（編集モーダル）
// ========================================
function renderEditAssigneeSelection() {
  const container = document.getElementById('edit-assignees')

  if (members.length === 0) {
    container.innerHTML = '<p class="no-members-message">メンバーがいません</p>'
    return
  }

  container.innerHTML = members.map(member => `
    <label class="assignee-option ${editAssignees.includes(member.id) ? 'selected' : ''}" data-member-id="${member.id}">
      <div class="assignee-color" style="background-color: ${member.color}"></div>
      ${escapeHtml(member.name)}
    </label>
  `).join('')

  container.querySelectorAll('.assignee-option').forEach(option => {
    option.addEventListener('click', () => {
      const memberId = option.dataset.memberId
      if (editAssignees.includes(memberId)) {
        editAssignees = editAssignees.filter(id => id !== memberId)
        option.classList.remove('selected')
      } else {
        editAssignees.push(memberId)
        option.classList.add('selected')
      }
    })
  })
}

// ========================================
// 期日クリアボタン表示更新（編集モーダル）
// ========================================
function updateEditClearDateButton() {
  const dueDate = document.getElementById('edit-due-date').value
  const dueTime = document.getElementById('edit-due-time').value
  const clearBtn = document.getElementById('edit-clear-date')

  if (dueDate || dueTime) {
    clearBtn.classList.remove('hidden')
  } else {
    clearBtn.classList.add('hidden')
  }
}

// ========================================
// 期日クリア（編集モーダル）
// ========================================
function clearEditDueDate() {
  document.getElementById('edit-due-date').value = ''
  document.getElementById('edit-due-time').value = ''
  updateEditClearDateButton()
}

// ========================================
// タスク保存
// ========================================
async function saveTask() {
  if (!editingTask) return

  const taskName = document.getElementById('edit-task-name').value.trim()
  if (!taskName) return

  const updateData = {
    task_name: taskName,
    memo: document.getElementById('edit-memo').value,
    project_id: document.getElementById('edit-project').value || null,
    priority_time_frame: document.getElementById('edit-time-frame').value,
    is_important: document.getElementById('edit-important').checked,
    is_pinned: document.getElementById('edit-pinned').checked,
    due_date: document.getElementById('edit-due-date').value || null,
    due_time: document.getElementById('edit-due-time').value || null,
    assignees: JSON.stringify(editAssignees)
  }

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', editingTask.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('保存したよ！✨')
  closeEditModal()
  await fetchTasks()
}

// ========================================
// タスク完了切り替え
// ========================================
async function toggleComplete(taskId, isCompleted) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  undoStack.push({
    action: 'complete',
    task: { ...task }
  })
  if (undoStack.length > UNDO_STACK_MAX_SIZE) {
    undoStack.shift()
  }
  updateUndoNotification()

  const { error } = await supabase
    .from('tasks')
    .update({
      is_completed: !isCompleted,
      completed_at: !isCompleted ? new Date().toISOString() : null
    })
    .eq('id', taskId)

  if (!error) {
    await fetchTasks()
  }
}

// ========================================
// 重要マーク切り替え
// ========================================
async function toggleImportant(taskId, isImportant) {
  tasks = tasks.map(task =>
    task.id === taskId ? { ...task, is_important: !isImportant } : task
  ).sort((a, b) => {
    return (a.sort_order || 0) - (b.sort_order || 0)
  })
  renderTaskList()

  const { error } = await supabase
    .from('tasks')
    .update({ is_important: !isImportant })
    .eq('id', taskId)

  if (error) {
    console.error('重要マーク更新エラー:', error)
    await fetchTasks()
  }
}

// ========================================
// ピン留め切り替え
// ========================================
async function togglePin(taskId, isPinned) {
  tasks = tasks.map(task =>
    task.id === taskId ? { ...task, is_pinned: !isPinned } : task
  ).sort((a, b) => {
    return (a.sort_order || 0) - (b.sort_order || 0)
  })
  renderTaskList()

  const { error } = await supabase
    .from('tasks')
    .update({ is_pinned: !isPinned })
    .eq('id', taskId)

  if (error) {
    console.error('ピン留め更新エラー:', error)
    await fetchTasks()
  }
}

// ========================================
// タスク削除
// ========================================
async function deleteTask(taskId) {
  if (!window.confirm('本当に削除する？')) return

  // 削除前にタスクデータを保存（Undo用）
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  // Undoスタックに追加
  undoStack.push({
    action: 'delete',
    task: { ...task }
  })
  if (undoStack.length > UNDO_STACK_MAX_SIZE) {
    undoStack.shift()
  }
  updateUndoNotification()

  tasks = tasks.filter(t => t.id !== taskId)
  renderTaskList()
}

// ========================================
// Undo機能
// ========================================
function setupUndoListener() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      handleUndo()
    }
  })
}

async function handleUndo() {
  if (undoStack.length === 0) {
    alert('戻す操作がないよ！')
    return
  }

  const lastAction = undoStack.pop()

  if (lastAction.action === 'complete') {
    // 完了のUndo
    const { error } = await supabase
      .from('tasks')
      .update({
        is_completed: lastAction.task.is_completed,
        completed_at: lastAction.task.completed_at
      })
      .eq('id', lastAction.task.id)

    if (!error) {
      updateUndoNotification()
      await fetchTasks()
      alert('完了を取り消したよ！↩️')
    }
  } else if (lastAction.action === 'delete') {
    // 削除のUndo（タスクを復元）
    const taskToRestore = lastAction.task

    // idを除いた新しいタスクとして挿入（idは自動生成させる）
    const { id, created_at, updated_at, ...taskData } = taskToRestore

    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()

    if (error) {
      alert('復元エラー: ' + error.message)
      return
    }

    updateUndoNotification()
    await fetchTasks()
    alert('削除を取り消したよ！↩️')
  }
}

function updateUndoNotification() {
  const notification = document.getElementById('undo-notification')
  const count = document.getElementById('undo-count')

  if (undoStack.length > 0) {
    notification.classList.remove('hidden')
    count.textContent = undoStack.length
  } else {
    notification.classList.add('hidden')
  }
}

// ========================================
// プロジェクトタブ表示
// ========================================
function renderProjectTabs() {
  const container = document.getElementById('project-tabs')
  if (!container) return

  let html = ''

  // ALLタブ
  html += `
    <button class="project-tab ${!currentProject ? 'active' : ''}" data-project-id="">
      ALL
    </button>
  `

  // プロジェクトタブ
  projects.forEach(project => {
    html += `
      <button 
        class="project-tab ${currentProject === project.id ? 'active' : ''}" 
        data-project-id="${project.id}"
        style="border-bottom-color: ${project.color_code}"
      >
        ${escapeHtml(project.project_name)}
      </button>
    `
  })

  // プロジェクト追加ボタン
  html += `
    <button class="project-tab project-tab-add" id="add-project-btn">
      ＋ プロジェクト
    </button>
  `

  container.innerHTML = html

  // タブクリックイベント
  container.querySelectorAll('.project-tab[data-project-id]').forEach(tab => {
    tab.addEventListener('click', () => {
      const projectId = tab.dataset.projectId || null
      switchProject(projectId)
    })
  })

  // プロジェクト追加ボタン
  document.getElementById('add-project-btn')?.addEventListener('click', openProjectCreateModal)
}

// ========================================
// プロジェクト切り替え
// ========================================
async function switchProject(projectId) {
  currentProject = projectId
  renderProjectTabs()
  updateProjectUI()
  await fetchTasks()
}

// ========================================
// プロジェクトUI更新
// ========================================
function updateProjectUI() {
  const subtitle = document.getElementById('app-subtitle')
  const description = document.getElementById('project-description')
  const settingsBtn = document.getElementById('project-settings-btn')

  if (currentProject) {
    const project = projects.find(p => p.id === currentProject)
    if (project) {
      subtitle.textContent = 'プロジェクトのタスク 📝'

      if (project.description) {
        description.textContent = project.description
        description.style.backgroundColor = `${project.color_code}15`
        description.style.borderLeft = `5px solid ${project.color_code}`
        description.classList.remove('hidden')
      } else {
        description.classList.add('hidden')
      }

      settingsBtn.classList.remove('hidden')
    }
  } else {
    subtitle.textContent = 'すべてのタスク 📝'
    description.classList.add('hidden')
    settingsBtn.classList.add('hidden')
  }
}

// ========================================
// プロジェクト作成モーダル
// ========================================
function openProjectCreateModal() {
  newProjectData = {
    project_name: '',
    description: '',
    color_code: '#FF69B4'
  }

  document.getElementById('project-create-name').value = ''
  document.getElementById('project-create-desc').value = ''

  renderColorPicker('project-create-colors', newProjectData.color_code, (color) => {
    newProjectData.color_code = color
  })

  document.getElementById('project-create-modal').classList.remove('hidden')
}

function closeProjectCreateModal() {
  document.getElementById('project-create-modal').classList.add('hidden')
}

async function createProject() {
  const name = document.getElementById('project-create-name').value.trim()
  if (!name) {
    alert('プロジェクト名を入力してね！')
    return
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      team_id: teamId,
      project_name: name,
      description: document.getElementById('project-create-desc').value,
      color_code: newProjectData.color_code,
      is_completed: false,
      is_archived: false
    })
    .select()

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('プロジェクト作成したよ！🚀')
  closeProjectCreateModal()
  await fetchProjects()
  renderProjectTabs()
}

// ========================================
// プロジェクト設定モーダル
// ========================================
async function openProjectSettingsModal() {
  if (!currentProject) return

  const project = projects.find(p => p.id === currentProject)
  if (!project) return

  editingProject = project
  editProjectColor = project.color_code

  document.getElementById('project-settings-name').value = project.project_name
  document.getElementById('project-settings-desc').value = project.description || ''

  renderColorPicker('project-settings-colors', editProjectColor, (color) => {
    editProjectColor = color
  })

  // プロジェクト完了ボタンの表示制御
  const completeBtn = document.getElementById('project-complete-btn')
  const canComplete = await checkProjectCanComplete(project.id)
  if (canComplete) {
    completeBtn.classList.remove('hidden')
  } else {
    completeBtn.classList.add('hidden')
  }

  document.getElementById('project-settings-modal').classList.remove('hidden')
}

function closeProjectSettingsModal() {
  document.getElementById('project-settings-modal').classList.add('hidden')
  editingProject = null
}

async function checkProjectCanComplete(projectId) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, is_completed')
    .eq('project_id', projectId)

  if (tasks && tasks.length > 0) {
    return tasks.every(task => task.is_completed)
  }
  return false
}

async function saveProjectSettings() {
  if (!editingProject) return

  const name = document.getElementById('project-settings-name').value.trim()
  if (!name) {
    alert('プロジェクト名を入力してね！')
    return
  }

  const { error } = await supabase
    .from('projects')
    .update({
      project_name: name,
      description: document.getElementById('project-settings-desc').value,
      color_code: editProjectColor
    })
    .eq('id', editingProject.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('保存したよ！✨')
  closeProjectSettingsModal()
  await fetchProjects()
  renderProjectTabs()
  updateProjectUI()
}

async function completeProject() {
  if (!editingProject) return
  if (!window.confirm('このプロジェクトを完了にする？🎉')) return

  const { error } = await supabase
    .from('projects')
    .update({
      is_completed: true,
      completed_at: new Date().toISOString()
    })
    .eq('id', editingProject.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('お疲れ様！プロジェクト完了だよ！🎉')
  closeProjectSettingsModal()
  currentProject = null
  await fetchProjects()
  renderProjectTabs()
  updateProjectUI()
  await fetchTasks()
}

async function archiveProject() {
  if (!editingProject) return
  if (!window.confirm('このプロジェクトをアーカイブする？📦')) return

  const { error } = await supabase
    .from('projects')
    .update({ is_archived: true })
    .eq('id', editingProject.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('アーカイブしたよ！📦')
  closeProjectSettingsModal()
  currentProject = null
  await fetchProjects()
  renderProjectTabs()
  updateProjectUI()
  await fetchTasks()
}

async function deleteProject() {
  if (!editingProject) return
  if (!window.confirm('マジで削除する？タスクも全部消えるよ！🗑️')) return

  // タスク削除
  await supabase
    .from('tasks')
    .delete()
    .eq('project_id', editingProject.id)

  // プロジェクト削除
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', editingProject.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('削除したよ！🗑️')
  closeProjectSettingsModal()
  currentProject = null
  await fetchProjects()
  renderProjectTabs()
  updateProjectUI()
  await fetchTasks()
}

// ========================================
// カラーピッカー生成
// ========================================
function renderColorPicker(containerId, selectedColor, onChange) {
  const container = document.getElementById(containerId)
  if (!container) return

  container.innerHTML = PROJECT_COLORS.map(color => `
    <div 
      class="color-option ${color === selectedColor ? 'selected' : ''}" 
      data-color="${color}"
      style="background-color: ${color}"
    ></div>
  `).join('')

  container.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
      container.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'))
      option.classList.add('selected')
      onChange(option.dataset.color)
    })
  })
}
// ========================================
// ドラッグ&ドロップ設定
// ========================================
function setupDragAndDrop() {
  const taskCards = document.querySelectorAll('.task-card')
  const dropZones = document.querySelectorAll('.timeframe-tasks')

  // タスクカードのドラッグイベント
  taskCards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart)
    card.addEventListener('dragend', handleDragEnd)
    card.addEventListener('dragover', handleCardDragOver)
    card.addEventListener('dragleave', handleCardDragLeave)
    card.addEventListener('drop', handleCardDrop)
  })

  // ドロップゾーン（時間枠エリア）のイベント
  dropZones.forEach(zone => {
    zone.addEventListener('dragover', handleZoneDragOver)
    zone.addEventListener('dragleave', handleZoneDragLeave)
    zone.addEventListener('drop', handleZoneDrop)
  })
}

// ========================================
// ドラッグ開始
// ========================================
function handleDragStart(e) {
  const taskId = e.currentTarget.dataset.taskId
  draggedTask = tasks.find(t => t.id === taskId)

  if (!draggedTask) return

  e.currentTarget.classList.add('dragging')

  // ドラッグデータを設定
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', taskId)

  // カスタムドラッグイメージ（オプション）
  const dragImage = document.createElement('div')
  dragImage.className = 'drag-overlay'
  dragImage.textContent = draggedTask.task_name
  document.body.appendChild(dragImage)
  e.dataTransfer.setDragImage(dragImage, 0, 0)

  // 少し遅れて削除（ドラッグイメージ用）
  setTimeout(() => {
    dragImage.remove()
  }, 0)
}

// ========================================
// ドラッグ終了
// ========================================
function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging')
  draggedTask = null

  // すべてのハイライトを解除
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over')
  })
}

// ========================================
// カード上でのドラッグオーバー（並び替え用）
// ========================================
function handleCardDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'

  const card = e.currentTarget
  if (card.dataset.taskId === draggedTask?.id) return

  // 前のハイライトを解除
  if (dragOverElement && dragOverElement !== card) {
    dragOverElement.classList.remove('drag-over')
  }

  card.classList.add('drag-over')
  dragOverElement = card
}

// ========================================
// カードからのドラッグリーブ
// ========================================
function handleCardDragLeave(e) {
  e.currentTarget.classList.remove('drag-over')
}

// ========================================
// カードへのドロップ（並び替え）
// ========================================
async function handleCardDrop(e) {
  e.preventDefault()
  e.stopPropagation()

  const targetCard = e.currentTarget
  targetCard.classList.remove('drag-over')

  if (!draggedTask) return

  const targetTaskId = targetCard.dataset.taskId
  const targetTask = tasks.find(t => t.id === targetTaskId)

  if (!targetTask || targetTask.id === draggedTask.id) return

  const targetTimeFrame = targetTask.priority_time_frame
  const sourceTimeFrame = draggedTask.priority_time_frame

  if (sourceTimeFrame === targetTimeFrame) {
    // 同じ時間枠内での並び替え
    await reorderTasksInSameTimeFrame(targetTimeFrame, draggedTask.id, targetTaskId)
  } else {
    // 異なる時間枠への移動＋並び替え
    await moveTaskToTimeFrame(draggedTask.id, targetTimeFrame, targetTaskId)
  }
}

// ========================================
// 時間枠エリアでのドラッグオーバー
// ========================================
function handleZoneDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'

  const zone = e.currentTarget
  zone.classList.add('drag-over')
}

// ========================================
// 時間枠エリアからのドラッグリーブ
// ========================================
function handleZoneDragLeave(e) {
  // 子要素への移動時はリーブしない
  if (e.currentTarget.contains(e.relatedTarget)) return
  e.currentTarget.classList.remove('drag-over')
}

// ========================================
// 時間枠エリアへのドロップ（末尾に追加）
// ========================================
async function handleZoneDrop(e) {
  e.preventDefault()

  const zone = e.currentTarget
  zone.classList.remove('drag-over')

  if (!draggedTask) return

  const targetTimeFrame = zone.dataset.timeframe
  const sourceTimeFrame = draggedTask.priority_time_frame

  // 同じ時間枠の場合は何もしない（カードへのドロップで処理）
  if (sourceTimeFrame === targetTimeFrame) return

  // 異なる時間枠への移動（末尾に追加）
  await moveTaskToTimeFrame(draggedTask.id, targetTimeFrame, null)
}

// ========================================
// 同じ時間枠内での並び替え
// ========================================
async function reorderTasksInSameTimeFrame(timeFrame, draggedId, targetId) {
  // 該当時間枠のタスクを取得
  const frameTasks = tasks.filter(t => t.priority_time_frame === timeFrame)

  const draggedIndex = frameTasks.findIndex(t => t.id === draggedId)
  const targetIndex = frameTasks.findIndex(t => t.id === targetId)

  if (draggedIndex === -1 || targetIndex === -1) return

  // 配列を並び替え
  const [removed] = frameTasks.splice(draggedIndex, 1)
  frameTasks.splice(targetIndex, 0, removed)

  // sort_orderを更新
  const updates = frameTasks.map((task, index) => ({
    id: task.id,
    sort_order: index
  }))

  // ローカル状態を即座に更新
  updates.forEach(u => {
    const task = tasks.find(t => t.id === u.id)
    if (task) task.sort_order = u.sort_order
  })

  // 再ソート
  tasks.sort((a, b) => {
    return (a.sort_order || 0) - (b.sort_order || 0)
  })

  renderTaskList()

  // DBに保存
  await Promise.all(
    updates.map(u =>
      supabase
        .from('tasks')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id)
    )
  )

  console.log('並び替え完了:', timeFrame)
}

// ========================================
// 異なる時間枠への移動
// ========================================
async function moveTaskToTimeFrame(taskId, targetTimeFrame, insertBeforeTaskId) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  // ターゲット時間枠のタスク
  const targetFrameTasks = tasks.filter(t => t.priority_time_frame === targetTimeFrame)

  let newSortOrder
  if (insertBeforeTaskId) {
    // 特定のタスクの前に挿入
    const targetIndex = targetFrameTasks.findIndex(t => t.id === insertBeforeTaskId)
    newSortOrder = targetIndex >= 0 ? targetIndex : targetFrameTasks.length
  } else {
    // 末尾に追加
    newSortOrder = targetFrameTasks.length
  }

  // ローカル状態を更新
  task.priority_time_frame = targetTimeFrame
  task.sort_order = newSortOrder

  // 再ソート
  tasks.sort((a, b) => {
    return (a.sort_order || 0) - (b.sort_order || 0)
  })

  renderTaskList()

  // DBに保存
  const { error } = await supabase
    .from('tasks')
    .update({
      priority_time_frame: targetTimeFrame,
      sort_order: newSortOrder
    })
    .eq('id', taskId)

  if (error) {
    console.error('時間枠移動エラー:', error)
    await fetchTasks() // エラー時はリフェッチ
  } else {
    console.log('時間枠移動完了:', targetTimeFrame)
  }
}
// ========================================
// メンバー管理モーダル
// ========================================
function openMemberModal() {
  newMemberColor = '#FF69B4'
  document.getElementById('member-name-input').value = ''
  document.getElementById('member-email-input').value = ''

  renderColorPicker('member-color-picker', newMemberColor, (color) => {
    newMemberColor = color
  })

  renderMemberList()
  document.getElementById('member-modal').classList.remove('hidden')
}

function closeMemberModal() {
  document.getElementById('member-modal').classList.add('hidden')
}

function renderMemberList() {
  const container = document.getElementById('member-list')

  if (members.length === 0) {
    container.innerHTML = '<p class="no-members">メンバーがいません</p>'
    return
  }

  container.innerHTML = members.map(member => `
    <div class="member-item" data-member-id="${member.id}">
      <div class="member-color-display" style="background-color: ${member.color}"></div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(member.name)}</div>
        <div class="member-email">${escapeHtml(member.email)}</div>
      </div>
      <div class="member-actions">
        <button class="btn btn-icon" data-action="edit-member">✏️</button>
        <button class="btn btn-icon btn-danger" data-action="delete-member">🗑️</button>
      </div>
    </div>
  `).join('')

  // イベントリスナー
  container.querySelectorAll('.member-item').forEach(item => {
    const memberId = item.dataset.memberId

    item.querySelector('[data-action="edit-member"]').addEventListener('click', () => {
      const member = members.find(m => m.id === memberId)
      if (member) openMemberEditModal(member)
    })

    item.querySelector('[data-action="delete-member"]').addEventListener('click', () => {
      deleteMember(memberId)
    })
  })
}

async function addMember() {
  const name = document.getElementById('member-name-input').value.trim()
  const email = document.getElementById('member-email-input').value.trim()

  if (!name || !email) {
    alert('名前とメールアドレスを入力してね！')
    return
  }

  const { data, error } = await supabase
    .from('members')
    .insert({
      team_id: teamId,
      name: name,
      email: email,
      color: newMemberColor
    })
    .select()

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('メンバーを追加したよ！👥')
  document.getElementById('member-name-input').value = ''
  document.getElementById('member-email-input').value = ''
  await fetchMembers()
  renderMemberList()
}

async function deleteMember(memberId) {
  if (!window.confirm('このメンバーを削除する？')) return

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', memberId)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('削除したよ！🗑️')
  await fetchMembers()
  renderMemberList()
}

// ========================================
// メンバー編集モーダル
// ========================================
function openMemberEditModal(member) {
  editingMember = member
  editMemberColor = member.color

  document.getElementById('member-edit-name').value = member.name
  document.getElementById('member-edit-email').value = member.email

  renderColorPicker('member-edit-color-picker', editMemberColor, (color) => {
    editMemberColor = color
  })

  document.getElementById('member-edit-modal').classList.remove('hidden')
}

function closeMemberEditModal() {
  document.getElementById('member-edit-modal').classList.add('hidden')
  editingMember = null
}

async function saveMember() {
  if (!editingMember) return

  const name = document.getElementById('member-edit-name').value.trim()
  const email = document.getElementById('member-edit-email').value.trim()

  if (!name || !email) {
    alert('名前とメールアドレスを入力してね！')
    return
  }

  const { error } = await supabase
    .from('members')
    .update({
      name: name,
      email: email,
      color: editMemberColor
    })
    .eq('id', editingMember.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('保存したよ！✨')
  closeMemberEditModal()
  await fetchMembers()
  renderMemberList()
}
// ========================================
// レポートモーダル
// ========================================
let reportData = []  // タスク+プロジェクトの結合データ
let editingReportTask = null  // 編集中のタスク

function openReportModal() {
  // デフォルトで今月の範囲を設定
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  document.getElementById('report-start-date').value = formatDate(startOfMonth)
  document.getElementById('report-end-date').value = formatDate(endOfMonth)

  fetchReportData()
  document.getElementById('report-modal').classList.remove('hidden')
}

function closeReportModal() {
  document.getElementById('report-modal').classList.add('hidden')
  reportData = []
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchReportData() {
  const startDate = document.getElementById('report-start-date').value
  const endDate = document.getElementById('report-end-date').value

  if (!startDate || !endDate) {
    alert('期間を指定してね！')
    return
  }

  // 完了タスクを取得
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_completed', true)
    .gte('completed_at', `${startDate}T00:00:00`)
    .lte('completed_at', `${endDate}T23:59:59`)

  if (tasksError) {
    console.error('タスク取得エラー:', tasksError.message)
  }

  // 完了プロジェクトを取得
  const { data: completedProjects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_completed', true)
    .gte('completed_at', `${startDate}T00:00:00`)
    .lte('completed_at', `${endDate}T23:59:59`)

  if (projectsError) {
    console.error('プロジェクト取得エラー:', projectsError.message)
  }

  // タスクとプロジェクトを結合して日付順にソート
  reportData = [
    ...(tasks || []).map(t => ({ ...t, type: 'task' })),
    ...(completedProjects || []).map(p => ({ ...p, type: 'project' }))
  ].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))

  renderReport()
}

function renderReport() {
  // サマリー
  const summaryContainer = document.getElementById('report-summary')
  const taskCount = reportData.filter(item => item.type === 'task').length
  const projectCount = reportData.filter(item => item.type === 'project').length

  summaryContainer.innerHTML = `
    <div class="report-stat">
      <div class="report-stat-value">${taskCount}</div>
      <div class="report-stat-label">完了タスク</div>
    </div>
    <div class="report-stat">
      <div class="report-stat-value">${projectCount}</div>
      <div class="report-stat-label">完了プロジェクト</div>
    </div>
  `

  // リストコンテナ
  const listContainer = document.getElementById('report-task-list')

  if (reportData.length === 0) {
    listContainer.innerHTML = '<p class="report-empty">この期間の完了タスク・プロジェクトはないよ〜</p>'
    return
  }

  // 日付ごとにグループ化
  const groupedData = reportData.reduce((acc, item) => {
    const date = item.completed_at.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {})

  // 日付の降順でソート
  const sortedDates = Object.keys(groupedData).sort().reverse()

  let html = ''

  sortedDates.forEach(date => {
    html += `
      <div class="report-date-group">
        <div class="report-date-header">${date}</div>
    `

    groupedData[date].forEach(item => {
      if (item.type === 'project') {
        // プロジェクト完了
        html += `
          <div class="report-item report-item-project">
            <div class="report-item-content">
              <div class="report-item-badge">PROJECT DONE</div>
              <div class="report-item-name">${escapeHtml(item.project_name)}</div>
              ${item.description ? `<div class="report-item-desc">${escapeHtml(item.description)}</div>` : ''}
            </div>
          </div>
        `
      } else {
        // タスク完了
        const project = projects.find(p => p.id === item.project_id)
        const projectName = project ? project.project_name : ''

        html += `
          <div class="report-item report-item-task" data-task-id="${item.id}">
            <div class="report-item-content" data-action="edit-report-task">
              <div class="report-item-name">✅ ${escapeHtml(item.task_name)}</div>
              <div class="report-item-meta">
                ${projectName ? `📁 ${escapeHtml(projectName)}` : ''}
              </div>
              ${item.memo ? `<div class="report-item-memo">${escapeHtml(item.memo)}</div>` : ''}
              ${item.result_memo ? `
                <div class="report-item-result">
                  📝 ${escapeHtml(item.result_memo)}
                </div>
              ` : `
                <div class="report-item-result-empty">(振り返りを入力...)</div>
              `}
            </div>
            <button class="btn btn-danger btn-sm" data-action="delete-report-task">削除</button>
          </div>
        `
      }
    })

    html += `</div>`
  })

  listContainer.innerHTML = html

  // イベントリスナー設定
  setupReportItemListeners()
}

function setupReportItemListeners() {
  document.querySelectorAll('.report-item-task').forEach(item => {
    const taskId = item.dataset.taskId

    // 編集（コンテンツクリック）
    item.querySelector('[data-action="edit-report-task"]')?.addEventListener('click', () => {
      const task = reportData.find(t => t.id === taskId && t.type === 'task')
      if (task) openReportEditModal(task)
    })

    // 削除
    item.querySelector('[data-action="delete-report-task"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteReportTask(taskId)
    })
  })
}

async function deleteReportTask(taskId) {
  if (!window.confirm('このタスクを削除する？\n振り返りコメントも一緒に消えるよ！')) return

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('削除したよ！🗑️')
  await fetchReportData()
}

// ========================================
// 振り返り編集モーダル
// ========================================
function openReportEditModal(task) {
  editingReportTask = task

  document.getElementById('report-edit-task-name').value = task.task_name
  document.getElementById('report-edit-memo').value = task.memo || ''
  document.getElementById('report-edit-result').value = task.result_memo || ''

  document.getElementById('report-edit-modal').classList.remove('hidden')
}

function closeReportEditModal() {
  document.getElementById('report-edit-modal').classList.add('hidden')
  editingReportTask = null
}

async function saveReportTask() {
  if (!editingReportTask) return

  const taskName = document.getElementById('report-edit-task-name').value.trim()
  if (!taskName) {
    alert('タスク名を入力してね！')
    return
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      task_name: taskName,
      memo: document.getElementById('report-edit-memo').value,
      result_memo: document.getElementById('report-edit-result').value
    })
    .eq('id', editingReportTask.id)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('保存したよ！✨')
  closeReportEditModal()
  await fetchReportData()
}
// ========================================
// アーカイブモーダル
// ========================================
async function openArchiveModal() {
  await fetchArchivedProjects()
  renderArchiveList()
  document.getElementById('archive-modal').classList.remove('hidden')
}

function closeArchiveModal() {
  document.getElementById('archive-modal').classList.add('hidden')
}

async function fetchArchivedProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_archived', true)  // ← 修正：アーカイブのみ
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('アーカイブ取得エラー:', error.message)
    return
  }

  archivedProjects = data || []
}

function renderArchiveList() {
  const container = document.getElementById('archive-list')

  if (archivedProjects.length === 0) {
    container.innerHTML = '<p class="archive-empty">アーカイブされたプロジェクトはないよ〜</p>'
    return
  }

  container.innerHTML = archivedProjects.map(project => {
    const status = project.is_completed ? '✅ 完了' : '📦 アーカイブ'
    const date = project.completed_at
      ? new Date(project.completed_at).toLocaleDateString('ja-JP')
      : new Date(project.updated_at).toLocaleDateString('ja-JP')

    return `
      <div class="archive-item" data-project-id="${project.id}">
        <div class="archive-item-info">
          <div class="archive-item-name">
            <div class="member-color-display" style="background-color: ${project.color_code}; width: 16px; height: 16px;"></div>
            ${escapeHtml(project.project_name)}
          </div>
          <div class="archive-item-meta">${status} ・ ${date}</div>
        </div>
        <button class="btn" data-action="restore">復元</button>
      </div>
    `
  }).join('')

  // 復元ボタンイベント
  container.querySelectorAll('[data-action="restore"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const projectId = e.target.closest('.archive-item').dataset.projectId
      await restoreProject(projectId)
    })
  })
}

async function restoreProject(projectId) {
  if (!window.confirm('このプロジェクトを復元する？')) return

  const { error } = await supabase
    .from('projects')
    .update({
      is_archived: false,
      is_completed: false,
      completed_at: null
    })
    .eq('id', projectId)

  if (error) {
    alert('エラー: ' + error.message)
    return
  }

  alert('復元したよ！✨')
  await fetchArchivedProjects()
  renderArchiveList()
  await fetchProjects()
  renderProjectTabs()
}
// ========================================
// PWA判定・設定
// ========================================
function checkPWAMode() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  const isIOSPWA = window.navigator.standalone === true
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  isPWA = (isStandalone || isIOSPWA) && isTouchDevice

  if (isPWA) {
    document.documentElement.classList.add('pwa-mode')
    document.body.classList.add('pwa-mode')
    console.log('🔥 PWAモード（タッチデバイス）で動作中')
  } else {
    document.documentElement.classList.remove('pwa-mode')
    document.body.classList.remove('pwa-mode')
    if (isStandalone || isIOSPWA) {
      console.log('💻 PWA（PC）で動作中 → 通常UIを使用')
    } else {
      console.log('🌐 Webモードで動作中')
    }
  }

  const pwaIndicator = document.getElementById('pwa-indicator')
  if (pwaIndicator && (isStandalone || isIOSPWA)) {
    pwaIndicator.classList.remove('hidden')
  }
}

function setupPWAListeners() {
  // 🆕 タッチデバイス判定を追加
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // display-mode変更を監視
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    // standaloneかつタッチデバイスの場合のみPWAモード
    isPWA = e.matches && isTouchDevice

    if (isPWA) {
      document.documentElement.classList.add('pwa-mode')
      document.body.classList.add('pwa-mode')
    } else {
      document.documentElement.classList.remove('pwa-mode')
      document.body.classList.remove('pwa-mode')
    }
    renderTaskList()
  })

  // オンライン/オフライン監視
  window.addEventListener('online', () => {
    isOnline = true
    document.getElementById('offline-indicator').classList.add('hidden')
    console.log('✅ オンラインに復帰')
  })

  window.addEventListener('offline', () => {
    isOnline = false
    document.getElementById('offline-indicator').classList.remove('hidden')
    console.log('❌ オフラインになりました')

    // 🆕 PWAモード時はalertも表示
    if (isPWA) {
      alert('オフラインモードです📡')
    }
  })

  window.addEventListener('online', () => {
    isOnline = true
    document.getElementById('offline-indicator').classList.add('hidden')
    console.log('✅ オンラインに復帰')

    // 🆕 PWAモード時はalertも表示
    if (isPWA) {
      alert('オンラインに復帰しました！✅')
    }
  })

  // 初期状態
  if (!isOnline) {
    document.getElementById('offline-indicator').classList.remove('hidden')
  }
}

// ========================================
// PWAスワイプ処理
// ========================================
function handleTouchStart(e, taskId) {
  if (!isPWA) return

  touchStartX = e.touches[0].clientX
  touchCurrentX = e.touches[0].clientX
  isSwiping = false
}

function handleTouchMove(e, taskId) {
  if (!isPWA) return

  touchCurrentX = e.touches[0].clientX
  const diff = Math.abs(touchCurrentX - touchStartX)

  if (diff > 10) {
    isSwiping = true
  }
}

function handleTouchEnd(e, taskId) {
  if (!isPWA || !isSwiping) {
    isSwiping = false
    return
  }

  const diff = touchCurrentX - touchStartX
  const threshold = 50

  // 他のタスクがスワイプされている場合は閉じる
  if (swipedTaskId && swipedTaskId !== taskId) {
    closeSwipe()
  }

  if (diff > threshold) {
    // 右スワイプ → 完了
    swipedTaskId = taskId
    swipeDirection = 'right'
    updateSwipeUI(taskId)
  } else if (diff < -threshold) {
    // 左スワイプ → 削除
    swipedTaskId = taskId
    swipeDirection = 'left'
    updateSwipeUI(taskId)
  } else {
    closeSwipe()
  }

  isSwiping = false
}

function updateSwipeUI(taskId) {
  // すべてのスワイプ状態をリセット
  document.querySelectorAll('.swipe-card').forEach(card => {
    card.classList.remove('swiped-right', 'swiped-left')
  })

  // 対象カードにスワイプクラスを追加
  const card = document.querySelector(`[data-task-id="${taskId}"] .swipe-card, [data-task-id="${taskId}"].swipe-card`)
  if (card) {
    if (swipeDirection === 'right') {
      card.classList.add('swiped-right')
    } else if (swipeDirection === 'left') {
      card.classList.add('swiped-left')
    }
  }
}

function closeSwipe() {
  swipedTaskId = null
  swipeDirection = null
  document.querySelectorAll('.swipe-card').forEach(card => {
    card.classList.remove('swiped-right', 'swiped-left')
  })
}

async function handleSwipeComplete(taskId) {
  if (!isPWA) return

  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  // Undo用に保存
  undoStack.push({
    action: 'complete',
    task: { ...task }
  })
  if (undoStack.length > UNDO_STACK_MAX_SIZE) {
    undoStack.shift()
  }
  updateUndoNotification()

  // アニメーション
  const element = document.querySelector(`[data-task-id="${taskId}"]`)
  if (element) {
    element.classList.add('swipe-out')
  }

  setTimeout(async () => {
    const { error } = await supabase
      .from('tasks')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (!error) {
      await fetchTasks()
    }
    closeSwipe()
  }, 300)
}

async function handleSwipeDelete(taskId) {
  if (!isPWA) return

  if (!window.confirm('本当に削除する？')) {
    closeSwipe()
    return
  }

  // 削除前にタスクデータを保存（Undo用）
  const task = tasks.find(t => t.id === taskId)
  if (!task) {
    closeSwipe()
    return
  }

  // アニメーション
  const element = document.querySelector(`[data-task-id="${taskId}"]`)
  if (element) {
    element.classList.add('swipe-out')
  }

  setTimeout(async () => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      alert('エラー: ' + error.message)
      closeSwipe()
      return
    }

    // Undoスタックに追加
    undoStack.push({
      action: 'delete',
      task: { ...task }
    })
    if (undoStack.length > UNDO_STACK_MAX_SIZE) {
      undoStack.shift()
    }
    updateUndoNotification()

    tasks = tasks.filter(t => t.id !== taskId)
    renderTaskList()
    closeSwipe()
  }, 300)
}
// ========================================
// 実行
// ========================================
init()

