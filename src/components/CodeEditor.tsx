/**
 * CodeEditor — CodeMirror 6 wrapper for the Workspace screen.
 *
 * Supports: Python · Rust · JavaScript · C · C++
 * Theme: hand-rolled from the app's CSS design tokens so the editor looks
 * native — no third-party theme dependency.
 */

import { useCallback, useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';

import type { WorkspaceLanguage } from '@/lib/api/schemas/workspace';
import { languageLabels, workspaceLanguages } from '@/lib/api/schemas/workspace';

// ---------------------------------------------------------------------------
// App-native CodeMirror theme (matches tokens.css)
// ---------------------------------------------------------------------------

const appTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
      fontFamily: 'var(--font-mono)',
      backgroundColor: 'var(--ink)',
      color: 'var(--cream)',
    },
    '.cm-content': {
      caretColor: 'var(--crimson)',
      padding: '1rem 0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--crimson)',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--ink)',
      color: 'rgba(245,240,231,0.35)',
      border: 'none',
      borderRight: '1px solid rgba(245,240,231,0.1)',
      paddingRight: '0.5rem',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(245,240,231,0.06)',
      color: 'rgba(245,240,231,0.7)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(245,240,231,0.04)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(189,46,36,0.28) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(189,46,36,0.36) !important',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(189,46,36,0.3)',
      outline: '1px solid rgba(189,46,36,0.6)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(245,240,231,0.1)',
      border: 'none',
      color: 'rgba(245,240,231,0.5)',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: '1.7',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '2.8rem',
      paddingLeft: '0.5rem',
    },
    // Scroll bar styling
    '&.cm-editor': {
      outline: 'none',
    },
  },
  { dark: true },
);

// ---------------------------------------------------------------------------
// Language extension resolver
// ---------------------------------------------------------------------------

function getLanguageExtension(lang: WorkspaceLanguage) {
  switch (lang) {
    case 'python':
      return python();
    case 'rust':
      return rust();
    case 'javascript':
      return javascript();
    case 'c':
      // CodeMirror's cpp() parser handles both C and C++
      return cpp();
    case 'cpp':
      return cpp();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: WorkspaceLanguage;
  onLanguageChange: (lang: WorkspaceLanguage) => void;
  disabled?: boolean;
  /** Optional: aria-label for the editor region */
  label?: string;
}

export function CodeEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  disabled = false,
  label = 'Code editor',
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Track whether we are in the middle of an external value update to avoid
  // re-triggering onChange and creating infinite loops.
  const externalUpdateRef = useRef(false);

  // Stable onChange callback so the effect doesn't re-run on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Build or re-build the EditorView whenever `language` changes.
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous view (language change wipes the view entirely so
    // CodeMirror re-parses from scratch with the new grammar).
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !externalUpdateRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const editableExt = EditorState.readOnly.of(disabled);

    const state = EditorState.create({
      doc: value,
      extensions: [
        // Line numbers + gutter
        lineNumbers(),
        highlightActiveLineGutter(),
        // Editing helpers
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        // Language
        getLanguageExtension(language),
        // Keymaps
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        // Theme
        appTheme,
        // Reactivity
        updateListener,
        editableExt,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // NOTE: intentionally excluding `value` and `disabled` — they are
    // handled by separate effects below to avoid full re-creates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Sync external value changes into the editor without destroying the view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;

    externalUpdateRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    externalUpdateRef.current = false;
  }, [value]);

  // Sync disabled/readOnly state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: EditorState.readOnly.reconfigure(disabled),
    });
  }, [disabled]);

  const handleLanguageClick = useCallback(
    (lang: WorkspaceLanguage) => {
      if (!disabled) onLanguageChange(lang);
    },
    [disabled, onLanguageChange],
  );

  return (
    <div className="code-editor">
      {/* Language switcher tabs */}
      <div className="code-editor__tabs" role="tablist" aria-label="Programming language">
        {workspaceLanguages.map((lang) => (
          <button
            key={lang}
            role="tab"
            aria-selected={lang === language}
            aria-controls="code-editor-panel"
            className={`code-editor__tab ${lang === language ? 'code-editor__tab--active' : ''}`}
            type="button"
            onClick={() => handleLanguageClick(lang)}
            disabled={disabled}
          >
            {languageLabels[lang]}
          </button>
        ))}
      </div>

      {/* CodeMirror mount point */}
      <div
        id="code-editor-panel"
        role="tabpanel"
        aria-label={label}
        className="code-editor__panel"
        ref={containerRef}
      />
    </div>
  );
}
