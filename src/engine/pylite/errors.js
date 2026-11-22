/**
 * Ошибка уровня Python-программы студента (SyntaxError, NameError, KeyError…).
 * Отличается от внутренних ошибок интерпретатора: её показываем студенту
 * в стиле Traceback и подсвечиваем строку в редакторе.
 */
export class PyError extends Error {
  constructor(type, message, line = null, hint = '') {
    super(message)
    this.pyType = type
    this.line = line // номер строки, с 1; null, если ещё не известен
    this.hint = hint
  }
}
