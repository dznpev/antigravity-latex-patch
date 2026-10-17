const fs = require('fs');
const path = require('path');
const { BackupManager } = require('./backup');

const HTML_MARKER_START = '<!-- AG-LATEX-PATCH-START -->';
const HTML_MARKER_END = '<!-- AG-LATEX-PATCH-END -->';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the standalone client-side injection script (ag-latex-script.js).
 * Version 1.0.0 (Production Release):
 * - Real-Time AI Streaming Support: Dynamically detects unrendered math without locking blocks.
 * - Math Italic Un-mangler: Restores <em>/<i> tags mistakenly generated around LaTeX underscores.
 * - Sequential Safe Range Engine: Safely handles consecutive display math blocks without DOM offset drift.
 * - 100% Trusted-Types & CSP Compliant: Uses W3C DOM Range & Node Manipulation APIs exclusively (zero innerHTML).
 * - Clean Console: Suppresses internal font metric warnings and non-strict unicode noise.
 *
 * @param {string} katexMinJsContent - Minified KaTeX UMD script
 * @param {string} autoRenderMinJsContent - Minified auto-render extension script
 * @returns {string} Bundled script content
 */
function buildStandaloneJs(katexMinJsContent, autoRenderMinJsContent) {
  const kStart = katexMinJsContent.indexOf('function(){"use strict";');
  const kFactoryBody = katexMinJsContent.substring(kStart, katexMinJsContent.length - 6);

  const aStart = autoRenderMinJsContent.indexOf('function(e){return function(){');
  const aFactoryBody = autoRenderMinJsContent.substring(aStart, autoRenderMinJsContent.length - 3);

  return `/*! Antigravity LaTeX Chat Patch - Production Engine v1.0.0 | MIT License */
(function() {
  if (typeof window === 'undefined') return;
  if (window.__AG_LATEX_INITIALIZED__) return;
  window.__AG_LATEX_INITIALIZED__ = true;

  try {
    // 1. Suppress noisy internal KaTeX warnings (font metrics for non-Latin glyphs, etc.)
    var originalWarn = console.warn;
    console.warn = function() {
      var firstArg = arguments[0];
      if (typeof firstArg === 'string' && (
        firstArg.indexOf('No character metrics') !== -1 ||
        firstArg.indexOf('LaTeX-incompatible') !== -1 ||
        firstArg.indexOf('KaTeX auto-render') !== -1 ||
        firstArg.indexOf('unknownSymbol') !== -1 ||
        firstArg.indexOf('unicodeTextInMathMode') !== -1
      )) {
        return;
      }
      originalWarn.apply(console, arguments);
    };

    // 2. Initialize core KaTeX into global window object
    var katexFactory = (${kFactoryBody});
    window.katex = katexFactory();

    // 3. Initialize Auto-render extension
    var autoRenderFactory = (${aFactoryBody});
    window.renderMathInElement = autoRenderFactory(window.katex);

    // Sanitize mathematical string: normalize AI-generated unicode quirks
    function sanitizeMathString(str) {
      if (!str) return '';
      return str
        .replace(/[\\u200B\\u200C\\u200D\\uFEFF]/g, '')
        .replace(/[\\u2032\\u02CA\\u0060]/g, "'")
        .replace(/[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]/g, ' ');
    }

    // 4. Un-mangle italics: recover <em>/<i> tags mistakenly inserted by Markdown around subscripts
    function unMangleItalicsInBlock(block) {
      var emNodes = block.querySelectorAll('em, i');
      var changed = false;

      emNodes.forEach(function(em) {
        var txt = em.textContent || "";
        var prevText = em.previousSibling && em.previousSibling.nodeType === 3 ? em.previousSibling.nodeValue : "";
        var nextText = em.nextSibling && em.nextSibling.nodeType === 3 ? em.nextSibling.nodeValue : "";

        var isMathItalic = (
          txt.indexOf('$') !== -1 ||
          txt.indexOf('\\\\') !== -1 ||
          txt.indexOf('{') !== -1 ||
          txt.indexOf('}') !== -1 ||
          prevText.endsWith('$') ||
          prevText.endsWith("''") ||
          prevText.endsWith("'") ||
          nextText.startsWith('$')
        );

        if (isMathItalic) {
          var restoredTextNode = document.createTextNode('_' + txt + '_');
          em.parentNode.replaceChild(restoredTextNode, em);
          changed = true;
        }
      });

      if (changed) {
        block.normalize();
      }
    }

    var renderOptionsBlock = {
      displayMode: true,
      throwOnError: false,
      strict: "ignore"
    };

    // 5. Sequential safe range rendering: process the next $$...$$ pair in the block
    function renderNextBlockEquation(block) {
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
      var textNodes = [];
      var node;
      while ((node = walker.nextNode())) {
        var p = node.parentNode;
        if (p && (p.closest('pre') || p.closest('code') || p.closest('.katex'))) continue;
        textNodes.push(node);
      }

      var inBlock = false;
      var startNode = null;
      var startOffset = -1;

      for (var i = 0; i < textNodes.length; i++) {
        var tNode = textNodes[i];
        var val = tNode.nodeValue || "";

        if (!inBlock) {
          var sIdx = val.indexOf('$$');
          if (sIdx !== -1) {
            var eIdx = val.indexOf('$$', sIdx + 2);
            if (eIdx !== -1) {
              // Both delimiters exist within the same text node
              var range = document.createRange();
              range.setStart(tNode, sIdx);
              range.setEnd(tNode, eIdx + 2);

              var mathContent = sanitizeMathString(val.substring(sIdx + 2, eIdx).trim());
              if (mathContent.indexOf('\\\\\\\\') !== -1 && mathContent.indexOf('\\\\begin{') === -1) {
                mathContent = '\\\\begin{aligned} ' + mathContent + ' \\\\end{aligned}';
              }

              var span = document.createElement("span");
              span.className = "katex-display-container";
              window.katex.render(mathContent, span, renderOptionsBlock);

              range.deleteContents();
              range.insertNode(span);
              block.normalize();
              return true;
            } else {
              inBlock = true;
              startNode = tNode;
              startOffset = sIdx;
            }
          }
        } else {
          var closeIdx = val.indexOf('$$');
          if (closeIdx !== -1) {
            // Multiline display math spanning across line breaks within the same block
            var multilineRange = document.createRange();
            multilineRange.setStart(startNode, startOffset);
            multilineRange.setEnd(tNode, closeIdx + 2);

            var rawMath = multilineRange.toString();
            if (rawMath.length < 2500) {
              rawMath = rawMath.replace(/^\\$\\$/, '').replace(/\\$\\$$/, '').trim();
              rawMath = sanitizeMathString(rawMath);

              if (rawMath.indexOf('\\\\\\\\') !== -1 && rawMath.indexOf('\\\\begin{') === -1) {
                rawMath = '\\\\begin{aligned} ' + rawMath + ' \\\\end{aligned}';
              }

              var multiSpan = document.createElement("span");
              multiSpan.className = "katex-display-container";
              window.katex.render(rawMath, multiSpan, renderOptionsBlock);

              multilineRange.deleteContents();
              multilineRange.insertNode(multiSpan);
              block.normalize();
              return true;
            }

            inBlock = false;
            startNode = null;
            startOffset = -1;
          }
        }
      }

      return false;
    }

    // 6. Comprehensive block processor supporting real-time AI response streaming
    function processBlockElement(block) {
      if (!block) return;
      if (block.closest('pre') || block.closest('code') || block.closest('.katex')) return;

      // 6.1. Dynamically check whether this block contains unrendered math markers
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
      var hasUnrenderedMath = false;
      var node;
      while ((node = walker.nextNode())) {
        var p = node.parentNode;
        if (p && (p.closest('pre') || p.closest('code') || p.closest('.katex'))) continue;
        var v = node.nodeValue || "";
        if (v.indexOf('$') !== -1 || v.indexOf('\\\\[') !== -1 || v.indexOf('\\\\(') !== -1) {
          hasUnrenderedMath = true;
          break;
        }
      }

      if (!hasUnrenderedMath) return;

      // 6.2. Recover any mangled italic subscripts
      unMangleItalicsInBlock(block);

      // 6.3. Render display equations sequentially
      var maxIterations = 20;
      while (maxIterations-- > 0) {
        var renderedOne = renderNextBlockEquation(block);
        if (!renderedOne) break;
      }

      // 6.4. Render remaining inline math expressions
      try {
        window.renderMathInElement(block, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\\\[", right: "\\\\]", display: true },
            { left: "\\\\(", right: "\\\\)", display: false }
          ],
          ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option", "button"],
          throwOnError: false,
          strict: "ignore",
          errorCallback: function() {}
        });
      } catch (eAuto) {}
    }

    // 7. Full chat panel scanner targeting leaf message containers
    function scanAndRender() {
      if (!window.katex || !document.body) return;

      var containers = document.querySelectorAll(
        '.md-divider-spacing, [class*="CustomMarkdown"]'
      );

      containers.forEach(function(mc) {
        var blocks = mc.querySelectorAll('p, li, blockquote, td, th');
        if (blocks && blocks.length > 0) {
          blocks.forEach(processBlockElement);
        } else {
          processBlockElement(mc);
        }
      });
    }

    var renderTimer = null;
    function scheduleRender() {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(scanAndRender, 120);
    }

    window.__renderLatexNow = scanAndRender;

    // 8. MutationObserver: reactively wakes on DOM updates (streaming or new messages)
    var observer = new MutationObserver(function() {
      scheduleRender();
    });

    function init() {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
        scheduleRender();
      }
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    window.addEventListener('load', scheduleRender);

    console.log('%c[Antigravity LaTeX Patch v1.0.0]%c Production AI Math Engine active.', 'color: #10b981; font-weight: bold;', 'color: inherit;');
  } catch (err) {
    console.error('[Antigravity LaTeX Patch] Initialization error:', err);
  }
})();
`;
}

/**
 * Checks if workbench.html currently contains the patch injection.
 *
 * @param {object} paths - Object containing Antigravity filesystem paths
 * @returns {boolean}
 */
function isPatched(paths) {
  if (!fs.existsSync(paths.workbenchHtml)) return false;
  const content = fs.readFileSync(paths.workbenchHtml, 'utf8');
  return content.includes(HTML_MARKER_START);
}

/**
 * Applies the LaTeX patch to Antigravity IDE workbench.
 *
 * @param {object} paths - Object containing Antigravity filesystem paths
 * @returns {boolean} True upon successful installation
 */
function applyPatch(paths) {
  const htmlBackup = new BackupManager(paths.workbenchHtml);
  htmlBackup.createBackup();

  // Locate KaTeX assets: prefer bundled assets inside repository for 100% portable execution
  const bundledDir = path.join(__dirname, 'assets', 'katex');
  const ideKatexDist = paths.nodeModulesKatex ? path.join(paths.nodeModulesKatex, 'dist') : null;

  let katexDist = null;
  if (fs.existsSync(path.join(bundledDir, 'katex.min.js'))) {
    katexDist = bundledDir;
  } else if (ideKatexDist && fs.existsSync(path.join(ideKatexDist, 'katex.min.js'))) {
    katexDist = ideKatexDist;
  } else {
    throw new Error('KaTeX distribution assets not found in repository or Antigravity IDE.');
  }

  const katexMinJsPath = path.join(katexDist, 'katex.min.js');
  const autoRenderPath = fs.existsSync(path.join(katexDist, 'auto-render.min.js'))
    ? path.join(katexDist, 'auto-render.min.js')
    : path.join(katexDist, 'contrib', 'auto-render.min.js');
  const katexCssPath = path.join(katexDist, 'katex.min.css');
  const fontsSrcDir = path.join(katexDist, 'fonts');

  if (!fs.existsSync(katexMinJsPath) || !fs.existsSync(katexCssPath)) {
    throw new Error('KaTeX minified assets missing.');
  }

  const scriptDestPath = path.join(paths.workbenchDir, 'ag-latex-script.js');
  const cssDestPath = path.join(paths.workbenchDir, 'ag-latex-style.css');
  const fontsDestDir = path.join(paths.workbenchDir, 'fonts');

  // 1. Write ag-latex-style.css
  const katexCss = fs.readFileSync(katexCssPath, 'utf8');
  fs.writeFileSync(cssDestPath, katexCss, 'utf8');

  // 2. Write ag-latex-script.js
  const katexMinJs = fs.readFileSync(katexMinJsPath, 'utf8');
  const autoRenderMinJs = fs.readFileSync(autoRenderPath, 'utf8');
  const fullJs = buildStandaloneJs(katexMinJs, autoRenderMinJs);
  fs.writeFileSync(scriptDestPath, fullJs, 'utf8');

  // 3. Copy fonts directory if missing
  if (fs.existsSync(fontsSrcDir) && !fs.existsSync(fontsDestDir)) {
    fs.cpSync(fontsSrcDir, fontsDestDir, { recursive: true });
  }

  // 4. Inject script and link tags into workbench.html
  let htmlContent = fs.readFileSync(paths.workbenchHtml, 'utf8');
  const regex = new RegExp(`${escapeRegex(HTML_MARKER_START)}[\\s\\S]*?${escapeRegex(HTML_MARKER_END)}`, 'g');
  htmlContent = htmlContent.replace(regex, '').trim();

  const injection = `
${HTML_MARKER_START}
<link rel="stylesheet" href="ag-latex-style.css">
<script src="ag-latex-script.js?v=1.0.0"></script>
${HTML_MARKER_END}
`;

  if (htmlContent.includes('</body>')) {
    htmlContent = htmlContent.replace('</body>', `${injection}\n</body>`);
  } else {
    htmlContent += injection;
  }

  fs.writeFileSync(paths.workbenchHtml, htmlContent, 'utf8');
  return true;
}

/**
 * Removes the LaTeX patch from Antigravity IDE workbench.
 *
 * @param {object} paths - Object containing Antigravity filesystem paths
 * @returns {object} Result object with restoredFromBackup flag
 */
function removePatch(paths) {
  const htmlBackup = new BackupManager(paths.workbenchHtml);
  let restoredFromBackup = false;

  if (htmlBackup.hasBackup()) {
    htmlBackup.restoreBackup();
    restoredFromBackup = true;
  } else if (fs.existsSync(paths.workbenchHtml)) {
    let content = fs.readFileSync(paths.workbenchHtml, 'utf8');
    const regex = new RegExp(`${escapeRegex(HTML_MARKER_START)}[\\s\\S]*?${escapeRegex(HTML_MARKER_END)}`, 'g');
    content = content.replace(regex, '');
    fs.writeFileSync(paths.workbenchHtml, content, 'utf8');
  }

  const scriptDestPath = path.join(paths.workbenchDir, 'ag-latex-script.js');
  const cssDestPath = path.join(paths.workbenchDir, 'ag-latex-style.css');

  if (fs.existsSync(scriptDestPath)) fs.unlinkSync(scriptDestPath);
  if (fs.existsSync(cssDestPath)) fs.unlinkSync(cssDestPath);

  return { restoredFromBackup };
}

module.exports = {
  isPatched,
  applyPatch,
  removePatch
};
