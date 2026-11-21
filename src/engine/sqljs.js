/**
 * Загрузка движка sql.js.
 *
 * Раньше он тянулся с CDN. Теперь файлы лежат рядом с приложением
 * (public/vendor/sql), поэтому тренажёр работает без внешней сети
 * и не зависит от доступности cdnjs.
 */
const BASE = `${import.meta.env.BASE_URL}vendor/sql/`

export async function loadSqlJs() {
  if (typeof window !== 'undefined' && typeof window.initSqlJs === 'function') {
    return window.initSqlJs
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = BASE + 'sql-wasm.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Не удалось загрузить движок sql.js'))
    document.head.appendChild(script)
  })

  if (typeof window.initSqlJs !== 'function') {
    throw new Error('sql.js загрузился, но initSqlJs недоступен')
  }
  return window.initSqlJs
}
