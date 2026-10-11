(function () {
  'use strict';

  var storageKey = 'mickey-tools-v1';
  var state = readState();
  var quizIndex = -1;
  var quizScore = 0;
  var quizAnswered = false;
  var questions = [
    { q: 'What is the capital of Tanzania?', a: ['Dodoma', 'Arusha', 'Mwanza'], correct: 0 },
    { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Mars', 'Jupiter'], correct: 1 },
    { q: 'How many sides does a hexagon have?', a: ['Five', 'Six', 'Eight'], correct: 1 },
    { q: 'Which ocean is the largest?', a: ['Atlantic', 'Indian', 'Pacific'], correct: 2 },
    { q: 'What is 12 x 8?', a: ['88', '96', '108'], correct: 1 }
  ];

  function byId(id) { return document.getElementById(id); }

  function readState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return {
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        poll: parsed.poll && typeof parsed.poll.question === 'string' && Array.isArray(parsed.poll.options) && Array.isArray(parsed.poll.votes) ? parsed.poll : null,
        language: parsed.language === 'en' ? 'en' : 'sw'
      };
    } catch (_) {
      return { reminders: [], checklist: [], history: [], language: 'sw' };
    }
  }

  function saveState() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
  }

  function logTool(name) {
    state.history.unshift({ name: name, at: new Date().toISOString() });
    state.history = state.history.slice(0, 30);
    saveState();
    renderHistory();
  }

  function setText(id, text) {
    var target = byId(id);
    if (target) target.textContent = text;
  }

  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = busy;
  }

  function showError(id, error) {
    setText(id, error && error.message ? error.message : 'Ombi halikufaulu. Jaribu tena.');
  }

  function appendResult(target, text, href) {
    var row = document.createElement(href ? 'a' : 'span');
    row.textContent = text;
    if (href) {
      row.href = href;
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
    }
    target.appendChild(row);
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Huduma haipatikani kwa sasa.');
        return data;
      });
    });
  }

  function renderReminders() {
    var target = byId('reminderList');
    if (!target) return;
    target.replaceChildren();
    state.reminders.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'tool-item';
      var label = document.createElement('span');
      label.textContent = item.text + ' · ' + new Date(item.at).toLocaleString();
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-sm';
      remove.textContent = 'Ondoa';
      remove.addEventListener('click', function () {
        state.reminders = state.reminders.filter(function (entry) { return entry.id !== item.id; });
        saveState();
        renderReminders();
      });
      row.append(label, remove);
      target.appendChild(row);
    });
  }

  function checkReminders() {
    var now = Date.now();
    var due = state.reminders.filter(function (item) { return !item.notified && new Date(item.at).getTime() <= now; });
    if (!due.length) return;
    due.forEach(function (item) {
      item.notified = true;
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Mickey reminder', { body: item.text });
    });
    saveState();
    renderReminders();
  }

  byId('reminderForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var text = byId('reminderText').value.trim();
    var at = new Date(byId('reminderAt').value);
    if (!text || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return showError('reminderList', new Error('Weka muda wa baadaye kwa kumbusho.'));
    state.reminders.push({ id: String(Date.now()), text: text, at: at.toISOString(), notified: false });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    saveState();
    event.target.reset();
    renderReminders();
    logTool('Reminder added');
  });

  function renderPoll(poll) {
    var target = byId('pollOutput');
    target.replaceChildren();
    if (!poll) return;
    appendResult(target, poll.question);
    poll.options.forEach(function (option, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-sm';
      button.textContent = option + ' · ' + poll.votes[index];
      button.addEventListener('click', function () {
        poll.votes[index] += 1;
        saveState();
        renderPoll(poll);
      });
      target.appendChild(button);
    });
    var share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn btn-ghost btn-sm';
    share.textContent = 'Nakili poll';
    share.addEventListener('click', function () {
      var text = poll.question + '\n' + poll.options.map(function (option, i) { return (i + 1) + '. ' + option; }).join('\n');
      navigator.clipboard.writeText(text).then(function () { window.showToast && window.showToast('Poll imenakiliwa'); });
    });
    target.appendChild(share);
  }

  byId('createPoll').addEventListener('click', function () {
    var question = byId('pollQuestion').value.trim();
    var options = byId('pollOptions').value.split(/[\n,]/).map(function (value) { return value.trim(); }).filter(Boolean).slice(0, 6);
    if (!question || options.length < 2) return showError('pollOutput', new Error('Weka swali na chaguo mbili au zaidi.'));
    state.poll = { question: question, options: options, votes: options.map(function () { return 0; }) };
    saveState();
    renderPoll(state.poll);
    logTool('Poll created');
  });

  function nextQuiz() {
    quizIndex = (quizIndex + 1) % questions.length;
    quizAnswered = false;
    var question = questions[quizIndex];
    setText('quizQuestion', question.q);
    var target = byId('quizAnswers');
    target.replaceChildren();
    question.a.forEach(function (answer, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-sm';
      button.textContent = answer;
      button.addEventListener('click', function () {
        if (quizAnswered) return;
        quizAnswered = true;
        if (index === question.correct) quizScore += 1;
        setText('quizScore', 'Alama: ' + quizScore);
        setText('quizQuestion', index === question.correct ? 'Sahihi! ' + question.q : 'Jibu sahihi: ' + question.a[question.correct]);
      });
      target.appendChild(button);
    });
  }

  byId('nextQuiz').addEventListener('click', function () { nextQuiz(); logTool('Quiz played'); });

  byId('weatherForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var city = byId('weatherCity').value.trim();
    var output = byId('weatherOutput');
    output.textContent = 'Inatafuta...';
    setBusy(form, true);
    fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=sw&name=' + encodeURIComponent(city))
      .then(function (placeData) {
        var place = placeData.results && placeData.results[0];
        if (!place) throw new Error('Mji haujapatikana.');
        return fetchJson('https://api.open-meteo.com/v1/forecast?current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto&latitude=' + place.latitude + '&longitude=' + place.longitude)
          .then(function (weather) { return { place: place, current: weather.current }; });
      })
      .then(function (result) {
        output.textContent = result.place.name + ', ' + (result.place.country || '') + ' · ' + result.current.temperature_2m + '°C (inahisiwa ' + result.current.apparent_temperature + '°C), unyevu ' + result.current.relative_humidity_2m + '%, upepo ' + result.current.wind_speed_10m + ' km/h.';
        logTool('Weather lookup');
      }).catch(function (error) { showError('weatherOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  byId('currencyForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var amount = Number(byId('currencyAmount').value);
    var from = byId('currencyFrom').value;
    var to = byId('currencyTo').value;
    var output = byId('currencyOutput');
    output.textContent = 'Inabadilisha...';
    setBusy(form, true);
    fetchJson('https://api.frankfurter.dev/v1/latest?base=' + encodeURIComponent(from) + '&symbols=' + encodeURIComponent(to))
      .then(function (data) {
        if (!data.rates || !data.rates[to]) throw new Error('Sarafu hii haitumiki na provider.');
        output.textContent = amount.toLocaleString() + ' ' + from + ' = ' + (amount * data.rates[to]).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + to + ' · rate ya ' + data.date;
        logTool('Currency conversion');
      }).catch(function (error) { showError('currencyOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  function evaluateExpression(expression) {
    var tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
    if (tokens.join('') !== expression.replace(/\s/g, '')) throw new Error('Tumia namba na alama + - * / % tu.');
    var position = 0;
    function primary() {
      var token = tokens[position++];
      if (token === '(') {
        var value = sum();
        if (tokens[position++] !== ')') throw new Error('Mabano hayajafungwa vizuri.');
        return value;
      }
      if (token === '-') return -primary();
      if (token === '+') return primary();
      var number = Number(token);
      if (!Number.isFinite(number)) throw new Error('Expression si sahihi.');
      return number;
    }
    function product() {
      var value = primary();
      while (['*', '/', '%'].includes(tokens[position])) {
        var operator = tokens[position++];
        var right = primary();
        if ((operator === '/' || operator === '%') && right === 0) throw new Error('Huwezi kugawa kwa sifuri.');
        value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
      }
      return value;
    }
    function sum() {
      var value = product();
      while (tokens[position] === '+' || tokens[position] === '-') {
        var operator = tokens[position++];
        var right = product();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }
    var result = sum();
    if (position !== tokens.length || !Number.isFinite(result)) throw new Error('Expression si sahihi.');
    return result;
  }

  byId('calculatorForm').addEventListener('submit', function (event) {
    event.preventDefault();
    try {
      setText('calculatorOutput', String(evaluateExpression(byId('calculatorInput').value)));
      logTool('Calculator used');
    } catch (error) { showError('calculatorOutput', error); }
  });

  byId('qrForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var output = byId('qrOutput');
    output.textContent = 'Inatengeneza...';
    setBusy(form, true);
    fetchJson('/api/tools/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: byId('qrText').value.trim() }) })
      .then(function (data) {
        output.replaceChildren();
        var image = document.createElement('img');
        image.src = data.dataUrl;
        image.alt = 'QR code';
        image.width = 220;
        image.height = 220;
        output.appendChild(image);
        logTool('QR generated');
      }).catch(function (error) { showError('qrOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  var tesseractPromise;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = function () { resolve(window.Tesseract); };
      script.onerror = function () { reject(new Error('OCR library haijapakiwa. Angalia internet kisha jaribu tena.')); };
      document.head.appendChild(script);
    });
    return tesseractPromise;
  }

  byId('runOcr').addEventListener('click', function (event) {
    var file = byId('ocrImage').files[0];
    if (!file) return showError('ocrOutput', new Error('Chagua picha kwanza.'));
    var button = event.currentTarget;
    button.disabled = true;
    setText('ocrOutput', 'Inasoma picha...');
    loadTesseract().then(function (engine) { return engine.recognize(file, 'eng+swa'); })
      .then(function (result) {
        setText('ocrOutput', result.data.text || 'Hakuna maandishi yaliyotambuliwa.');
        logTool('OCR used');
      }).catch(function (error) { showError('ocrOutput', error); })
      .finally(function () { button.disabled = false; });
  });

  byId('summarizeText').addEventListener('click', function () {
    var text = byId('summaryInput').value.trim();
    if (!text) return showError('summaryOutput', new Error('Bandika maandishi kwanza.'));
    var sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    if (sentences.length <= 3) return setText('summaryOutput', text);
    var frequencies = Object.create(null);
    text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu).forEach(function (word) { frequencies[word] = (frequencies[word] || 0) + 1; });
    var ranked = sentences.map(function (sentence, index) {
      var words = sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
      return { index: index, sentence: sentence.trim(), score: words.reduce(function (total, word) { return total + frequencies[word]; }, 0) / Math.max(words.length, 1) };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, Math.max(2, Math.ceil(sentences.length * 0.3))).sort(function (a, b) { return a.index - b.index; });
    setText('summaryOutput', ranked.map(function (item) { return item.sentence; }).join(' '));
    logTool('Text summarized');
  });

  byId('vcardForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = byId('vcardName').value.trim().replace(/[\n;]/g, ' ');
    var phone = byId('vcardPhone').value.trim().replace(/[\n;]/g, ' ');
    var email = byId('vcardEmail').value.trim().replace(/[\n;]/g, ' ');
    var content = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + name, phone && 'TEL;TYPE=CELL:' + phone, email && 'EMAIL:' + email, 'END:VCARD'].filter(Boolean).join('\r\n');
    downloadFile('contact.vcf', content, 'text/vcard');
    logTool('Contact card created');
  });

  function downloadFile(name, content, type) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: type }));
    link.download = name;
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  byId('wikiForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var output = byId('wikiOutput');
    output.textContent = 'Inatafuta...';
    setBusy(form, true);
    var query = byId('wikiQuery').value.trim();
    fetchJson('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&format=json&origin=*')
      .then(function (data) {
        output.replaceChildren();
        (data.query.search || []).slice(0, 5).forEach(function (item) {
          appendResult(output, item.title + ' · ' + item.snippet.replace(/<[^>]*>/g, ''), 'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_')));
        });
        if (!output.children.length) setText('wikiOutput', 'Hakuna matokeo.');
        logTool('Wikipedia search');
      }).catch(function (error) { showError('wikiOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  byId('newsForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var output = byId('newsOutput');
    output.textContent = 'Inapakia habari...';
    setBusy(form, true);
    fetchJson('/api/tools/news?category=' + encodeURIComponent(byId('newsCategory').value))
      .then(function (data) {
        output.replaceChildren();
        (data.articles || []).slice(0, 8).forEach(function (article) {
          appendResult(output, article.title + (article.source ? ' · ' + article.source : ''), article.url);
        });
        if (!output.children.length) setText('newsOutput', 'Hakuna habari zilizopatikana.');
        logTool('News opened');
      }).catch(function (error) { showError('newsOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  byId('cryptoForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var output = byId('cryptoOutput');
    var coin = byId('cryptoCoin').value;
    output.textContent = 'Inatafuta bei...';
    setBusy(form, true);
    fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(coin) + '&vs_currencies=usd,tzs')
      .then(function (data) {
        var price = data[coin];
        if (!price) throw new Error('Bei haipatikani sasa.');
        output.textContent = coin.toUpperCase() + ' · $' + Number(price.usd).toLocaleString() + ' · TZS ' + Number(price.tzs).toLocaleString();
        logTool('Crypto price checked');
      }).catch(function (error) { showError('cryptoOutput', error); })
      .finally(function () { setBusy(form, false); });
  });

  byId('captionForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var topic = byId('captionTopic').value.trim();
    var tags = topic.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    var caption = 'Kila hatua ina maana. Leo tunasherehekea ' + topic + '!';
    var hashtags = Array.from(new Set(['#' + tags.join(''), '#MickeyGlitch', '#Tanzania', '#Inspiration'])).join(' ');
    setText('captionOutput', caption + '\n' + hashtags);
    logTool('Caption generated');
  });

  function drawMeme() {
    var canvas = byId('memeCanvas');
    var context = canvas.getContext('2d');
    context.fillStyle = '#20332b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = byId('memeColor').value;
    context.fillRect(0, 0, canvas.width, 14);
    context.fillStyle = '#f5f6f1';
    context.textAlign = 'center';
    context.font = '700 34px Space Grotesk, sans-serif';
    context.shadowColor = '#101613';
    context.shadowBlur = 7;
    context.fillText(byId('memeTop').value.slice(0, 80), canvas.width / 2, 90, canvas.width - 36);
    context.fillText(byId('memeBottom').value.slice(0, 80), canvas.width / 2, canvas.height - 35, canvas.width - 36);
    context.shadowBlur = 0;
    logTool('Meme generated');
  }

  byId('makeMeme').addEventListener('click', drawMeme);
  byId('downloadMeme').addEventListener('click', function () {
    var link = document.createElement('a');
    link.href = byId('memeCanvas').toDataURL('image/png');
    link.download = 'mickey-meme.png';
    link.click();
  });

  byId('nearbySearch').addEventListener('click', function (event) {
    var button = event.currentTarget;
    var output = byId('nearbyOutput');
    if (!navigator.geolocation) return showError('nearbyOutput', new Error('Browser hii haitoi location.'));
    button.disabled = true;
    output.textContent = 'Inatafuta location...';
    navigator.geolocation.getCurrentPosition(function (position) {
      var lat = position.coords.latitude;
      var lon = position.coords.longitude;
      var query = '[out:json][timeout:20];(node[amenity~"hospital|police|atm"](around:5000,' + lat + ',' + lon + ');way[amenity~"hospital|police|atm"](around:5000,' + lat + ',' + lon + '););out center tags 15;';
      fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query) })
        .then(function (response) { if (!response.ok) throw new Error('Huduma ya ramani haipatikani.'); return response.json(); })
        .then(function (data) {
          output.replaceChildren();
          (data.elements || []).slice(0, 10).forEach(function (place) {
            var name = place.tags.name || place.tags.amenity || 'Huduma';
            appendResult(output, name + ' · ' + (place.tags.amenity || 'karibu'), 'https://www.openstreetmap.org/?mlat=' + (place.lat || place.center?.lat) + '&mlon=' + (place.lon || place.center?.lon) + '#map=17');
          });
          if (!output.children.length) setText('nearbyOutput', 'Hakuna huduma zilizopatikana ndani ya km 5.');
          logTool('Nearby places searched');
        }).catch(function (error) { showError('nearbyOutput', error); }).finally(function () { button.disabled = false; });
    }, function (error) {
      showError('nearbyOutput', new Error(error.message || 'Ruhusu location kisha jaribu tena.'));
      button.disabled = false;
    }, { timeout: 15000, maximumAge: 60000 });
  });

  function renderChecklist() {
    var output = byId('checklistOutput');
    output.replaceChildren();
    state.checklist.forEach(function (item) {
      var row = document.createElement('label');
      row.className = 'tool-item';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.done;
      checkbox.addEventListener('change', function () { item.done = checkbox.checked; saveState(); });
      var text = document.createElement('span');
      text.textContent = item.text;
      text.style.textDecoration = item.done ? 'line-through' : '';
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-sm';
      remove.textContent = 'Ondoa';
      remove.addEventListener('click', function () { state.checklist = state.checklist.filter(function (entry) { return entry.id !== item.id; }); saveState(); renderChecklist(); });
      row.append(checkbox, text, remove);
      output.appendChild(row);
    });
  }

  byId('checklistForm').addEventListener('submit', function (event) {
    event.preventDefault();
    state.checklist.push({ id: String(Date.now()), text: byId('checklistText').value.trim(), done: false });
    saveState();
    event.target.reset();
    renderChecklist();
    logTool('Checklist updated');
  });

  function renderHistory() {
    var output = byId('historyOutput');
    if (!output) return;
    output.replaceChildren();
    (window.activityEntries || []).slice(0, 8).forEach(function (entry) { appendResult(output, new Date(entry.at).toLocaleTimeString() + ' · ' + entry.message); });
    state.history.slice(0, 8).forEach(function (entry) { appendResult(output, new Date(entry.at).toLocaleTimeString() + ' · ' + entry.name); });
  }

  byId('showPrivacy').addEventListener('click', function () {
    var bytes = 0;
    try { bytes = new Blob([localStorage.getItem(storageKey) || '']).size; } catch (_) {}
    setText('privacyOutput', 'Tools huhifadhi takriban ' + bytes + ' bytes kwenye browser hii. Data haipatikani kwa akaunti nyingine.');
  });

  var translations = {
    en: ['Reminders', 'Quick poll', 'Quiz / Trivia', 'Weather', 'Exchange rate', 'Calculator', 'QR code', 'Image OCR', 'Text summary', 'Contact card', 'Wikipedia', 'Latest news', 'Crypto prices', 'Caption & hashtags', 'Meme maker', 'Nearby services', 'Checklist', 'Activity history', 'Privacy'],
    sw: ['Vikumbusho', 'Kura ya haraka', 'Quiz / Trivia', 'Hali ya hewa', 'Exchange rate', 'Calculator', 'QR code', 'OCR ya picha', 'Muhtasari wa maandishi', 'Contact card', 'Wikipedia', 'Habari mpya', 'Crypto prices', 'Caption & hashtags', 'Meme maker', 'Huduma zilizo karibu', 'Checklist', 'Historia ya shughuli', 'Faragha']
  };

  function applyLanguage(language) {
    state.language = language === 'en' ? 'en' : 'sw';
    byId('toolsLanguage').value = state.language;
    document.querySelectorAll('.tool-card h3').forEach(function (heading, index) { heading.textContent = translations[state.language][index]; });
    saveState();
  }

  byId('toolsLanguage').addEventListener('change', function (event) { applyLanguage(event.target.value); });

  state.poll = state.poll || null;
  renderReminders();
  renderPoll(state.poll);
  renderChecklist();
  renderHistory();
  applyLanguage(state.language);
  nextQuiz();
  checkReminders();
  window.setInterval(checkReminders, 30000);
})();