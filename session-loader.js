(() => {
  const statusText = document.getElementById("statusTextDiv");

  if (!statusText) {
    return;
  }

  // A phone held upright shows the 16:9 game at about a third of its size.
  // The overlay is only displayed by CSS for coarse-pointer portrait screens.
  const hint = document.createElement("div");
  hint.id = "rotateHint";
  hint.innerHTML =
    '<div class="rotate-hint__phone" aria-hidden="true"></div>' +
    "<p>Поверните телефон горизонтально</p>" +
    "<small>Игра рассчитана на широкий экран</small>" +
    '<button type="button">Всё равно играть</button>';
  hint.querySelector("button").addEventListener("click", () => hint.remove());
  document.body.append(hint);

  const messages = [
    ["Loading...", "Собираем конспекты и сверяем расписание…"],
    ["loading...", "Собираем конспекты и сверяем расписание…"],
    ["Loading script...", "Загружаем сценарий сессии…"],
    ["Unpacking game data...", "Распаковываем материалы к сессии…"],
    ["Unpacking...", "Раскладываем материалы по папкам…"],
    ["Unpacking", "Распаковываем"],
    ["Running...", "Открываем Бесконечную сессию…"],
    ["Downloading data...", "Загружаем материалы к сессии…"],
    [
      "This browser does not support WebAssembly.",
      "Этот браузер не поддерживает WebAssembly.",
    ],
    [
      "Downloading engine...",
      "Загружаем ваши данные в MAX… Пока только расписание с Баобаба.",
    ],
    [
      "Downloading game data...",
      "Отключаем VPN перед зачётом… Сеть не трогаем, ищем аудиторию.",
    ],
    [
      "Preloading game files into browser cache...",
      "Раскладываем конспекты по кэшу браузера…",
    ],
    [
      "This browser does not support fetch.",
      "Этот браузер не умеет загружать файлы игры.",
    ],
    [
      "This browser requires the game to be run from a web server (i.e. double-clicking on index.html won't work).",
      "Откройте игру через веб-сайт: запуск файла index.html с диска не работает.",
    ],
    ["The game exited unexpectedly.", "Игра неожиданно завершилась."],
    ["The game aborted unexpectedly.", "Игра аварийно остановилась."],
    ["The game may not be able to save properly.", "Сохранения могут работать неправильно."],
    ["Could not create ~/.renpy/", "Не удалось создать каталог сохранений."],
    ["Could not load game.zip:", "Не удалось загрузить архив игры:"],
    ["Could not download game.zip", "Не удалось скачать архив игры."],
    [
      "Warning: cannot import savegames: write error:",
      "Не удалось записать импортированные сохранения:",
    ],
    ["Saves imported successfully.", "Сохранения импортированы."],
    ["Saves imported - restart game to apply.", "Перезапустите игру, чтобы применить сохранения."],
    ["Saves exported successfully.", "Сохранения экспортированы."],
    ["Couldn't import the savegames:", "Не удалось импортировать сохранения:"],
    [
      "Error syncing IDBFS:",
      "Ошибка синхронизации локальных сохранений:",
    ],
  ];

  const translateStatusText = (value) => {
    let translated = String(value);
    for (const [source, target] of messages) {
      translated = translated.replaceAll(source, target);
    }
    return translated;
  };

  for (const method of ["print", "printErr"]) {
    const original = window.Module?.[method];
    if (typeof original === "function") {
      window.Module[method] = (message) => original(translateStatusText(message));
    }
  }

  const translate = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      for (const [source, target] of messages) {
        if (node.nodeValue.includes(source)) {
          node.nodeValue = translateStatusText(node.nodeValue);
          break;
        }
      }
    }
  };

  new MutationObserver(translate).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  translate();

  const showBootError = (message, error) => {
    statusText.textContent = message;
    console.error("Could not start the compressed Ren'Py Web runtime.", error);
  };

  const waitForController = async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("This browser does not support service workers.");
    }
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser does not support streaming gzip decompression.");
    }

    let readyTimeout;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve, reject) => {
          readyTimeout = window.setTimeout(
            () => reject(new Error("The service worker did not become ready.")),
            20000,
          );
        }),
      ]);
    } finally {
      window.clearTimeout(readyTimeout);
    }
    if (navigator.serviceWorker.controller) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener("controllerchange", checkController);
        reject(new Error("The service worker did not take control of the page."));
      }, 20000);

      const checkController = () => {
        if (!navigator.serviceWorker.controller) {
          return;
        }
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("controllerchange", checkController);
        resolve();
      };

      navigator.serviceWorker.addEventListener("controllerchange", checkController);
      checkController();
    });
  };

  const startEngine = async () => {
    const statusDiv = document.getElementById("statusDiv");
    if (statusDiv) {
      statusDiv.classList.remove("hidden");
    }
    statusText.textContent = "Готовим короткую дорогу к сессии…";

    try {
      await waitForController();
      const script = document.createElement("script");
      script.async = true;
      script.src = "renpy.js";
      script.onerror = (error) => {
        showBootError("Не удалось загрузить движок. Перезагрузите страницу.", error);
      };
      document.body.append(script);
    } catch (error) {
      showBootError(
        "Браузер не смог включить сжатую загрузку. Откройте игру в актуальном Chrome или Firefox.",
        error,
      );
    }
  };

  void startEngine();
})();
