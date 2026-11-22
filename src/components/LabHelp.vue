<template>
  <div class="help">
    <h3>Что умеет интерпретатор</h3>
    <ul>
      <li>Переменные, числа, строки, списки, словари, кортежи, <code>None</code>, <code>True</code>/<code>False</code>.</li>
      <li><code>if / elif / else</code>, <code>for</code>, <code>while</code>, <code>break</code>, <code>continue</code>.</li>
      <li>Функции <code>def</code>, <code>lambda</code>, <code>return</code>, аргументы по умолчанию и <code>name=значение</code>.</li>
      <li>f-строки: <code>f"{x:.2f}"</code>, генераторы списков и словарей, срезы <code>a[1:3]</code>.</li>
      <li><code>try / except</code>, <code>raise</code>, <code>import</code> модулей <code>transformers</code>, <code>math</code>, <code>random</code>, <code>json</code>, <code>time</code>.</li>
    </ul>

    <h3>Из transformers доступно</h3>
    <ul>
      <li><code>pipeline("sentiment-analysis")</code>, <code>pipeline("text-generation")</code>, <code>pipeline("summarization")</code>.</li>
      <li><code>pipeline("translation", model="Helsinki-NLP/opus-mt-en-ro")</code> только в режиме «Реальные модели».</li>
      <li><code>AutoTokenizer.from_pretrained("gpt2")</code> с методом <code>tokenize</code> (и <code>encode</code> в реальном режиме).</li>
      <li><code>set_seed(42)</code>: повторяемая генерация в демо-режиме.</li>
    </ul>

    <h3>Чем это отличается от настоящего Python</h3>
    <ul>
      <li>Нет классов, <code>with</code>, <code>yield</code>, множеств, файлов, <code>input()</code> и библиотек вроде NumPy.</li>
      <li>Нет <code>torch</code> и <code>tf-keras</code>: модели работают в браузере через Transformers.js, ставить ничего не нужно.</li>
      <li>Число <code>2.0</code> печатается как <code>2</code>: JavaScript не различает целые и дробные.</li>
      <li>Демо-модели игрушечные: они показывают форму ответа, но не настоящее качество. Сравни их с реальными.</li>
      <li>В реальном режиме <code>facebook/bart-large-cnn</code> заменяется уменьшенной DistilBART, а параметры, которых нет в браузерной версии, игнорируются (об этом пишет вывод).</li>
    </ul>

    <h3>Как читать ошибки</h3>
    <ul>
      <li>Строка с ошибкой подсвечивается красным, клик по сообщению переводит курсор к ней.</li>
      <li>Под ошибкой появляется подсказка на русском: что обычно не так и как исправить.</li>
      <li><code>NameError</code>: имя не создано или опечатка. <code>KeyError</code>: нет такого ключа. <code>TypeError</code>: не тот тип, например строка плюс число.</li>
    </ul>

    <h3>Горячие клавиши</h3>
    <ul>
      <li><code>F5</code> или <code>Ctrl+Enter</code>: запуск. <code>Ctrl+/</code>: закомментировать строки. <code>Tab</code> и <code>Shift+Tab</code>: отступ.</li>
    </ul>
  </div>
</template>
