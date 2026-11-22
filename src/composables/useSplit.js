import { ref } from 'vue'

/**
 * Разделитель между редактором и панелью результатов: перетаскивание мышью/пальцем,
 * стрелки ↑↓ с клавиатуры, двойной клик возвращает размер по умолчанию.
 * Положение запоминается в localStorage под своим ключом.
 */
export function useSplit(storageKey, mainEl) {
  const readSplit = () => {
    try { const v = parseFloat(localStorage.getItem(storageKey)); return v > 0 && v < 1 ? v : null } catch (e) { return null }
  }
  const split = ref(readSplit())
  const dragging = ref(false)

  function save() {
    try { if (split.value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, String(split.value)) } catch (e) { /* хранилище недоступно */ }
  }

  function setFromY(y) {
    const m = mainEl.value
    if (!m) return
    const r = m.getBoundingClientRect()
    const min = 90
    const max = r.height - 110
    split.value = Math.min(max, Math.max(min, y - r.top)) / r.height
  }

  function start(e) {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    dragging.value = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function move(e) { if (dragging.value) setFromY(e.clientY) }

  function end() {
    if (!dragging.value) return
    dragging.value = false
    save()
  }

  function key(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const r = mainEl.value.getBoundingClientRect()
    const cur = (split.value ?? 0.4) * r.height + r.top
    setFromY(cur + (e.key === 'ArrowUp' ? -24 : 24))
    save()
  }

  function reset() { split.value = null; save() }

  return { split, dragging, start, move, end, key, reset }
}
