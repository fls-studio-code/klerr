/**
 * Проверка лаборатории Transformers: интерпретатор мини-Python, демо-модели
 * и все примеры из меню «Примеры» (в демо-режиме, без сети).
 * Запуск: npm test
 */
import { runProgram } from '../src/engine/pylite/interp.js'
import { createML } from '../src/engine/ml/index.js'
import { LAB_ALL, LAB_WELCOME } from '../src/lab/examples.js'
import { resolveModel, resolveTokenizer, normalizeTask } from '../src/engine/ml/catalog.js'

let failed = 0
const ok = (name) => console.log(`ok    ${name}`)
const fail = (name, msg) => { failed++; console.log(`FAIL  ${name}\n      ${msg}`) }

const ml = createML({
  getMode: () => 'demo',
  info: () => {},
  confirmDownload: async () => false,
  onProgress: () => {},
})

async function run(src) {
  let out = ''
  ml.beginRun()
  const res = await runProgram(src, { write: (t) => { out += t }, ml, cancel: { value: false } })
  return { out, err: res.error }
}

/* ---------- язык ---------- */
const OUT = [
  ['арифметика', 'print(10 / 4, 7 // 2, -7 % 3, 2 ** 10, 7 % -3)', '2.5 3 2 1024 -2\n'],
  ['округление', 'print(round(2.5), round(3.5), round(3.14159, 2), round(-2.5))', '2 4 3.14 -2\n'],
  ['строки', 'print("Hello".upper(), "a,b,c".split(","), "  x ".strip(), "-".join(["a", "b"]), "abc"[::-1], "abc"[1:])', "HELLO ['a', 'b', 'c'] x a-b cba bc\n"],
  ['f-строки', 'x = 3.14159\nn = 1234567\nprint(f"{x:.2f}|{n:,}|{x!r}|{\'a\':>3}|{n:>10}|{7:03d}|{0.256:.1%}")', '3.14|1,234,567|3.14159|  a|   1234567|007|25.6%\n'],
  ['списки', 'a = [3, 1, 2]\na.append(5)\na.sort()\nprint(a, a[-1], len(a), a[1:3], sum(a), max(a), min(a))', '[1, 2, 3, 5] 5 4 [2, 3] 11 5 1\n'],
  ['словари', 'd = {"a": 1}\nd["b"] = 2\nprint(d, list(d.keys()), d.get("z", 0), "a" in d, len(d))\nfor k, v in d.items():\n    print(k, v)', "{'a': 1, 'b': 2} ['a', 'b'] 0 True 2\na 1\nb 2\n"],
  ['генераторы', 'print([x * x for x in range(6) if x % 2 == 0], {k: len(k) for k in ["aa", "b"]})', "[0, 4, 16] {'aa': 2, 'b': 1}\n"],
  ['функции', 'def f(a, b=2, *rest):\n    return a + b\nprint(f(1), f(1, 5), f(b=10, a=1))'.replace(', *rest', ''), '3 6 11\n'],
  ['рекурсия', 'def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\nprint(fib(12))', '144\n'],
  ['lambda и sorted', 'print(sorted(["bb", "a", "ccc"], key=lambda s: -len(s)), list(map(lambda x: x + 1, [1, 2])))', "['ccc', 'bb', 'a'] [2, 3]\n"],
  ['while и break', 'i = 0\nwhile True:\n    i += 1\n    if i > 3:\n        break\nprint(i)', '4\n'],
  ['распаковка', 'a, b = 1, 2\na, b = b, a\nprint(a, b)\nfor i, (x, y) in enumerate([(1, 2), (3, 4)]):\n    print(i, x + y)', '2 1\n0 3\n1 7\n'],
  ['try/except', 'try:\n    {}["k"]\nexcept KeyError as e:\n    print("KeyError", e)\ntry:\n    int("x")\nexcept ValueError:\n    print("ValueError")', "KeyError 'k'\nValueError\n"],
  ['сравнения', 'print(1 < 2 < 3, "a" < "b", [1, 2] == [1, 2], None is None, 3 in [1, 3], "x" not in "abc")', 'True True True True True True\n'],
  ['тернарное', 'x = 5\nprint("big" if x > 3 else "small", x > 3 and "yes" or "no")', 'big yes\n'],
  ['json', 'import json\nprint(json.dumps({"a": [1, 2], "b": None, "c": True}))', '{"a": [1, 2], "b": null, "c": true}\n'],
  ['str.format', 'print("{} and {:.1f} and {name}".format("a", 2.25, name="n"))', 'a and 2.2 and n\n'],
  ['tuple repr', 'print((1,), (1, 2), [(1, "a")])', "(1,) (1, 2) [(1, 'a')]\n"],
  ['print sep/end', 'print("a", "b", sep="-", end="!")\nprint()', 'a-b!\n'],
  ['set_seed и random', 'import random\nrandom.seed(1)\na = random.random()\nrandom.seed(1)\nprint(a == random.random())', 'True\n'],
  ['многострочный вызов', 'x = max(\n    1,  # первый\n    5,\n    2,\n)\nprint(x)', '5\n'],
  ['тройные кавычки', 's = """a\nb"""\nprint(len(s.split()))', '2\n'],
  ['float-экспонента', 'print(1e-5, 0.1 + 0.2, 1 / 3)', '1e-05 0.30000000000000004 0.3333333333333333\n'],
]

for (const [name, src, want] of OUT) {
  const r = await run(src)
  if (r.err) fail(name, `ошибка ${r.err.type} (строка ${r.err.line}): ${r.err.message}`)
  else if (r.out !== want) fail(name, `ожидалось ${JSON.stringify(want)}, получено ${JSON.stringify(r.out)}`)
  else ok(name)
}

/* ---------- ошибки: тип и номер строки ---------- */
const ERR = [
  ['NameError', 'a = 1\nprint(b)', 'NameError', 2],
  ['опечатка в имени', 'print(lenn([1]))', 'NameError', 1],
  ['TypeError str+int', 'x = 1\nprint("a" + x)', 'TypeError', 2],
  ['KeyError', 'd = {"a": 1}\nprint(d["b"])', 'KeyError', 2],
  ['IndexError', 'l = [1]\nprint(l[5])', 'IndexError', 2],
  ['ZeroDivisionError', 'x = 0\nprint(1 / x)', 'ZeroDivisionError', 2],
  ['SyntaxError', 'x = (1 +', 'SyntaxError', 1],
  ['нет двоеточия', 'if True\n    print(1)', 'SyntaxError', 1],
  ['IndentationError', 'for i in range(2):\nprint(i)', 'IndentationError', 2],
  ['ModuleNotFoundError', 'import torch', 'ModuleNotFoundError', 1],
  ['ImportError', 'from transformers import Foo', 'ImportError', 1],
  ['не импортировал pipeline', 'p = pipeline("sentiment-analysis")', 'NameError', 1],
  ['ошибка внутри функции', 'def f():\n    return 1 / 0\nf()', 'ZeroDivisionError', 2],
  ['бесконечная рекурсия', 'def f():\n    return f()\nf()', 'RecursionError', 2],
  ['умные кавычки', 'print(“hi”)', 'SyntaxError', 1],
  ['класс не поддерживается', 'class A:\n    pass', 'SyntaxError', 1],
]

for (const [name, src, type, line] of ERR) {
  const r = await run(src)
  if (!r.err) fail(name, 'ожидалась ошибка, программа выполнилась')
  else if (r.err.type !== type || r.err.line !== line) fail(name, `ожидалось ${type} в строке ${line}, получено ${r.err.type} в строке ${r.err.line}: ${r.err.message}`)
  else if (!r.err.hint) fail(name, 'у ошибки нет подсказки')
  else ok(name)
}

{
  const r = await run('x = 0\nwhile True:\n    x += 1')
  if (!r.err || r.err.type !== 'RuntimeError') fail('бесконечный цикл', JSON.stringify(r.err))
  else ok('бесконечный цикл останавливается')
}

{
  const cancel = { value: false }
  setTimeout(() => { cancel.value = true }, 30)
  const res = await runProgram('while True:\n    pass', { write: () => {}, ml, cancel, maxSteps: 1e12 })
  if (!res.error || res.error.type !== 'KeyboardInterrupt') fail('Stop', JSON.stringify(res.error))
  else ok('кнопка Stop прерывает цикл')
}

/* ---------- демо-модели ---------- */
async function value(src) {
  const r = await run(src)
  if (r.err) throw new Error(`${r.err.type}: ${r.err.message}`)
  return r.out.trim()
}

const PRE = 'from transformers import pipeline, set_seed, AutoTokenizer\n'
const checks = [
  ['sentiment: позитив', PRE + 'p = pipeline("sentiment-analysis")\nprint(p("Great coffee and friendly staff!")[0]["label"])', 'POSITIVE'],
  ['sentiment: негатив', PRE + 'p = pipeline("sentiment-analysis")\nprint(p("The service was terribly slow and rude."))', null, o => o.includes("'NEGATIVE'")],
  ['sentiment: отрицание', PRE + 'p = pipeline("sentiment-analysis")\nprint(p("not good at all")[0]["label"])', 'NEGATIVE'],
  ['sentiment: список', PRE + 'p = pipeline("sentiment-analysis")\nprint(len(p(["a", "b", "c"])))', '3'],
  ['sentiment: форма ответа', PRE + 'p = pipeline("sentiment-analysis")\nr = p("love it")\nprint(type(r).__name__, list(r[0].keys()))', "list ['label', 'score']"],
  ['generation: set_seed повторяется', PRE + 'set_seed(42)\ng = pipeline("text-generation", model="gpt2")\na = g("Once upon a time", max_new_tokens=20)[0]["generated_text"]\nset_seed(42)\nb = g("Once upon a time", max_new_tokens=20)[0]["generated_text"]\nprint(a == b)', 'True'],
  ['generation: начинается с запроса', PRE + 'g = pipeline("text-generation")\nprint(g("Once upon a time", max_new_tokens=10)[0]["generated_text"].startswith("Once upon a time"))', 'True'],
  ['generation: длина', PRE + 'g = pipeline("text-generation")\nt = g("Hello", max_new_tokens=15, do_sample=False)[0]["generated_text"]\nprint(len(t.split()) > 5)', 'True'],
  ['generation: несколько вариантов', PRE + 'g = pipeline("text-generation")\nprint(len(g("Hello", max_new_tokens=5, num_return_sequences=3)))', '3'],
  ['summarization: короче оригинала', PRE + 's = pipeline("summarization")\ntext = "AI is a science. It teaches computers to learn from data. Models find patterns in data. Good data makes a better model. Students practice every week. Practice makes progress."\nr = s(text, max_length=30, min_length=10)[0]["summary_text"]\nprint(len(r) < len(text), len(r) > 0)', 'True True'],
  ['tokenizer: Ġ', PRE + 'tok = AutoTokenizer.from_pretrained("gpt2")\nprint(tok.tokenize("Transformers are amazing!"))', "['Transform', 'ers', 'Ġare', 'Ġamazing', '!']"],
  ['translation в демо — понятная ошибка', PRE + 'pipeline("translation", model="Helsinki-NLP/opus-mt-en-ro")', null, null, true],
]

for (const [name, src, want, pred, expectErr] of checks) {
  try {
    if (expectErr) {
      const r = await run(src)
      if (!r.err || r.err.type !== 'RuntimeError' || !r.err.hint.includes('Реальные модели')) fail(name, JSON.stringify(r.err))
      else ok(name)
      continue
    }
    const got = await value(src)
    if (pred ? !pred(got) : got !== want) fail(name, `ожидалось ${JSON.stringify(want)}, получено ${JSON.stringify(got)}`)
    else ok(name)
  } catch (e) {
    fail(name, e.message)
  }
}

/* ---------- каталог моделей ---------- */
{
  const cases = [
    [['text-generation', 'gpt2'], 'Xenova/gpt2'],
    [['sentiment-analysis', 'distilbert/distilbert-base-uncased-finetuned-sst-2-english'], 'Xenova/distilbert-base-uncased-finetuned-sst-2-english'],
    [['summarization', 'facebook/bart-large-cnn'], 'Xenova/distilbart-cnn-6-6'],
    [['translation', 'Helsinki-NLP/opus-mt-en-ro'], 'Xenova/opus-mt-en-ro'],
    [['summarization', null], 'Xenova/distilbart-cnn-6-6'],
    [['text-classification', 'Xenova/bert-base-multilingual-uncased-sentiment'], 'Xenova/bert-base-multilingual-uncased-sentiment'],
    [['text-classification', 'nlptown/bert-base-multilingual-uncased-sentiment'], 'Xenova/bert-base-multilingual-uncased-sentiment'],
  ]
  for (const [[task, name], hub] of cases) {
    const got = resolveModel(task, name).hub
    if (got !== hub) fail(`каталог ${task}/${name}`, `ожидалось ${hub}, получено ${got}`)
    else ok(`каталог ${task}/${name}`)
  }
  if (resolveTokenizer('gpt2') !== 'Xenova/gpt2') fail('токенизатор gpt2', resolveTokenizer('gpt2'))
  else ok('токенизатор gpt2')
  if (normalizeTask('translation_en_to_ro') !== 'translation') fail('normalizeTask', normalizeTask('translation_en_to_ro'))
  else ok('normalizeTask')
}

/* ---------- примеры из меню (демо-режим) ---------- */
for (const ex of [{ id: 'welcome', code: LAB_WELCOME }, ...LAB_ALL]) {
  for (const pass of [1, 2]) {
    const r = await run(ex.code)
    if (ex.real) {
      if (!r.err || r.err.type !== 'RuntimeError') fail(`${ex.id} (#${pass})`, 'в демо-режиме ожидалась понятная ошибка про «Реальные модели»')
      else ok(`${ex.id} (#${pass}) → подсказка про реальные модели`)
    } else if (r.err) {
      fail(`${ex.id} (#${pass})`, `${r.err.type} (строка ${r.err.line}): ${r.err.message}`)
    } else if (!r.out.trim()) {
      fail(`${ex.id} (#${pass})`, 'пример ничего не вывел')
    } else {
      ok(`${ex.id} (#${pass})`)
    }
  }
}

console.log(failed ? `\n${failed} проверок не прошло.` : '\nЛаборатория: все проверки прошли.')
process.exit(failed ? 1 : 0)
