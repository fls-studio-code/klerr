/**
 * Примеры для меню «Примеры» лаборатории Transformers (урок 11).
 * Код повторяет CODE.txt урока, но с пояснениями в комментариях.
 * Поле real: true означает, что пример показывает возможности настоящих моделей.
 */

export const LAB_WELCOME = `# Лаборатория Transformers: мини-Python прямо в браузере.
#
#   F5 или Ctrl+Enter — запустить программу
#   «Примеры» вверху — готовый код к уроку 11
#   переключатель «Демо / Реальные модели» — игрушечные модели или настоящие
#
# Код можно менять: перепиши текст, фразу или параметры и запусти снова.

from transformers import pipeline

sentiment = pipeline("sentiment-analysis")

reviews = [
    "Great coffee and friendly staff!",
    "The service was terribly slow.",
]
for r in reviews:
    res = sentiment(r)[0]
    print(r, "->", res["label"], round(res["score"], 4))
`

export const LAB_LESSONS = [
  {
    lesson: 1,
    title: 'Блок 1. Знакомство с интерпретатором',
    items: [
      {
        id: 'lab-hello',
        title: 'Привет, интерпретатор',
        hint: 'print, переменные, цикл, f-строка',
        code: `# Это мини-Python, который работает прямо в браузере.
# Нажми ▶ Run (F5 или Ctrl+Enter).

name = "Klerr"
print("Привет,", name)

scores = [7, 9, 6, 10]
total = 0
for s in scores:
    total = total + s
print(f"Сумма: {total}, среднее: {total / len(scores):.2f}")

# Попробуй: измени список scores и запусти ещё раз.
# Попробуй ошибку: напиши print(foo) и посмотри на сообщение.
`,
      },
      {
        id: 'lab-mini-sentiment',
        title: 'Мини-«модель» своими руками',
        hint: 'функция, словарь, цикл: модель — это тоже функция',
        code: `# Настоящая модель тоже превращает текст в ответ.
# Здесь мы пишем самую простую: считаем хорошие и плохие слова.

good = ["great", "love", "tasty", "friendly", "fast"]
bad = ["slow", "rude", "cold", "terrible", "dirty"]

def analyze(review):
    cleaned = review.lower().replace("!", "").replace(".", "").replace(",", "")
    score = 0
    for w in cleaned.split():
        if w in good:
            score += 1
        if w in bad:
            score -= 1
    if score >= 0:
        return {"label": "POSITIVE", "score": score}
    return {"label": "NEGATIVE", "score": score}

reviews = [
    "Great coffee and friendly staff!",
    "The service was slow and the waiter was rude.",
    "The weather is okay.",
    "Not great, not terrible.",
]
for r in reviews:
    print(r, "->", analyze(r))

# Подумай: что показал последний отзыв и почему?
# Список слов не понимает контекст. Именно это решает attention в Transformers.
`,
      },
    ],
  },
  {
    lesson: 2,
    title: 'Блок 2. Pipeline из урока',
    items: [
      {
        id: 'lab-gpt2',
        title: 'Генерация текста (GPT‑2)',
        hint: 'text-generation, set_seed, max_new_tokens',
        code: `from transformers import pipeline, set_seed

set_seed(42)  # результат повторяется; убери строку, и каждый запуск будет новым

generator = pipeline("text-generation", model="gpt2")

result = generator(
    "Once upon a time",
    max_new_tokens=40,       # сколько НОВЫХ токенов дописать
    num_return_sequences=1,  # сколько вариантов вернуть
    do_sample=True,          # выбирать случайно, а не всегда самое вероятное
)
print(result[0]["generated_text"])

# Эксперименты:
# 1) temperature=0.3 даёт скучный и предсказуемый текст, temperature=1.5 даёт хаос
# 2) другая первая фраза: "The best programming language is"
# 3) фраза на румынском: модель знает почти только английский
`,
      },
      {
        id: 'lab-sentiment',
        title: 'Тональность текста (DistilBERT)',
        hint: 'sentiment-analysis, список отзывов, score',
        code: `from transformers import pipeline

sentiment = pipeline(
    "sentiment-analysis",
    model="distilbert/distilbert-base-uncased-finetuned-sst-2-english",
)

print(sentiment("I love using transformers!"))

reviews = [
    "Great coffee and friendly staff!",
    "The service was terribly slow.",
    "The weather is okay.",
    "Oh great, another delay.",
]
for r, res in zip(reviews, sentiment(reviews)):
    print(r, "->", res["label"], round(res["score"], 4))

# Подумай: что делает модель с нейтральной фразой? Нейтрального класса нет.
# А с сарказмом «Oh great, another delay.»?
`,
      },
      {
        id: 'lab-summarize',
        title: 'Краткое изложение (BART)',
        hint: 'summarization, max_length, min_length',
        code: `from transformers import pipeline

summarizer = pipeline("summarization", model="facebook/bart-large-cnn")

text = """
Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans and animals.
Leading AI textbooks define the field as the study of intelligent agents: any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals.
Colloquially, the term artificial intelligence is often used to describe machines that mimic cognitive functions that humans associate with the human mind, such as learning and problem-solving.
As machines become increasingly capable, tasks considered to require intelligence are often removed from the definition of AI, a phenomenon known as the AI effect.
"""

summary = summarizer(text, max_length=50, min_length=25, do_sample=False, truncation=True)
print(summary[0]["summary_text"])

# Сравни длину: сколько слов было и сколько стало?
print(len(text.split()), "->", len(summary[0]["summary_text"].split()))
`,
      },
      {
        id: 'lab-tokens',
        title: 'Токены: как модель «читает» текст',
        hint: 'AutoTokenizer, tokenize, символ Ġ',
        code: `from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("gpt2")

for text in ["Transformers are amazing!", "Hello, world", "Привет, мир"]:
    tokens = tok.tokenize(text)
    print(tokens)
    print("  слов:", len(text.split()), "· токенов:", len(tokens))

# Символ Ġ означает пробел перед словом.
# max_new_tokens считает токены, а не слова, поэтому ответ короче, чем кажется.
# В демо-режиме токены приближённые, настоящий словарь GPT‑2 в режиме «Реальные модели».
`,
      },
    ],
  },
  {
    lesson: 3,
    title: 'Блок 3. Проект',
    items: [
      {
        id: 'lab-cafe',
        title: 'Проект: анализатор отзывов о кафе',
        hint: 'вход → модель → выход, доля позитивных',
        code: `from transformers import pipeline

# ВХОД: отзывы (замени на свои)
reviews = [
    "Amazing espresso and a cozy place.",
    "The waiter was rude and the soup was cold.",
    "Fast service, fair prices, will come again!",
    "Too noisy and way too expensive.",
    "Best croissants in town.",
    "I waited forty minutes for a sandwich.",
]

# МОДЕЛЬ
sentiment = pipeline("sentiment-analysis")
results = sentiment(reviews)

# ВЫХОД
positive = 0
for r, res in zip(reviews, results):
    mark = "+" if res["label"] == "POSITIVE" else "-"
    print(mark, r)
    if res["label"] == "POSITIVE":
        positive += 1

share = positive / len(reviews) * 100
print(f"\\nПозитивных отзывов: {positive} из {len(reviews)} ({share:.0f}%)")

# SMART-цель из урока: не меньше 85% правильных ответов на твоих отзывах.
# Проверь вручную, где модель ошиблась, и добавь этот случай в презентацию.
`,
      },
      {
        id: 'lab-prototype',
        title: 'Прототип: заглушка вместо модели',
        hint: 'USE_MODEL = False → True',
        code: `# Прототип: сначала проверяем весь путь «вход → функция → вывод» с заглушкой,
# и только потом подключаем настоящую модель.

USE_MODEL = False   # поменяй на True, когда схема готова

if USE_MODEL:
    from transformers import pipeline
    sentiment = pipeline("sentiment-analysis")

def analyze(review):
    if USE_MODEL:
        return sentiment(review)[0]
    return {"label": "POSITIVE", "score": 0.99}   # заглушка

for r in ["Great coffee!", "Too slow service."]:
    print(r, "->", analyze(r))
`,
      },
      {
        id: 'lab-translate',
        title: 'Бонус: перевод en → ro',
        hint: 'translation · только «Реальные модели»',
        real: true,
        code: `from transformers import pipeline

# Нужен режим «Реальные модели» (модель около 108 МБ, скачивается один раз).
translator = pipeline("translation", model="Helsinki-NLP/opus-mt-en-ro")

for text in ["I like learning data science.", "Good morning, how are you?"]:
    print(text, "->", translator(text)[0]["translation_text"])
`,
      },
    ],
  },
]

export const LAB_ALL = LAB_LESSONS.flatMap(l => l.items)

export function findLabExample(id) {
  return LAB_ALL.find(e => e.id === id)
}

export const LAB_SNIPPETS = [
  { label: 'import', insert: 'from transformers import pipeline\n' },
  { label: 'pipeline', insert: 'pipe = pipeline("sentiment-analysis")\n' },
  { label: 'print', insert: 'print()' },
  { label: 'for', insert: 'for x in items:\n    ' },
  { label: 'if', insert: 'if x:\n    ' },
  { label: 'def', insert: 'def analyze(text):\n    return ' },
  { label: 'f""', insert: 'f"{}"' },
  { label: '[ ]', insert: '[]' },
  { label: '{ }', insert: '{}' },
  { label: '( )', insert: '()' },
  { label: '"', insert: '"' },
  { label: ':', insert: ':' },
  { label: '=', insert: ' = ' },
  { label: '[0]', insert: '[0]' },
  { label: '["label"]', insert: '["label"]' },
  { label: '#', insert: '# ' },
]
