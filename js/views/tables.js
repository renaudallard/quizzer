/* The tables of a card field in the editor, each as a grid of cells to type
   in, with buttons for its rows, its columns and their alignment. The
   field keeps the table as Markdown, written again from the grid at every
   change, so nobody has to line pipes up by hand. */

import { el, icon, mount } from '../dom.js';
import { t } from '../i18n/index.js';
import { blocks, tableSource } from '../text.js';

const ALIGNS = [
  ['', 'editor.tableAlignAuto'], ['left', 'editor.tableAlignLeft'],
  ['center', 'editor.tableAlignCenter'], ['right', 'editor.tableAlignRight'],
];

/* The grids of field, in a node to put under it. Text typed in the field
   draws them again. A change made in a grid writes the field and tells it
   with an input event, so the card and the preview follow, and leaves the
   grids alone unless it added or took away cells, so the cell being typed
   in keeps the focus. */
export function tableEditors(field) {
  const root = el('div', { class: 'table-editors' });
  let parts = [];
  let writing = false;

  /* at names a cell to put the focus in: the table by its place among the
     tables, the row, -1 being the header, and the column. */
  function show(at) {
    parts = blocks(field.value);
    mount(root, parts.filter((part) => part.table).map(grid));
    const cell = at && root.querySelectorAll('.table-edit')[at.table]
      ?.querySelector('[data-row="' + at.row + '"][data-col="' + at.col + '"]');
    if (cell) cell.focus();
  }

  function write(at) {
    writing = true;
    field.value = parts.map((part) => (part.table ? tableSource(part.table) : part.text)).join('\n');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    writing = false;
    if (at) show(at);
  }

  function grid(part, index) {
    const { head, align, rows } = part.table;
    const columns = head.map((_, col) => col);
    const at = (row, col) => ({ table: index, row, col });

    function addRow(col) {
      rows.push(head.map(() => ''));
      write(at(rows.length - 1, col));
    }

    /* row is -1 for the header. Enter goes down a row, as in a
       spreadsheet, and adds one under the last. The cell is left first,
       so its keyboard notation is written before the grid is drawn again. */
    function cell(cells, row, col) {
      const input = el('input', {
        type: 'text', class: 'input table-cell', value: cells[col],
        dataset: { row: String(row), col: String(col) },
        style: align[col] ? { textAlign: align[col] } : null,
        placeholder: row < 0 ? t('editor.tableHeadPlaceholder') : null,
        'aria-label': row < 0
          ? t('editor.tableHeadCell', { col: col + 1 })
          : t('editor.tableCell', { row: row + 1, col: col + 1 }),
        oninput: () => { cells[col] = input.value; write(); },
        onkeydown: (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const below = root.querySelectorAll('.table-edit')[index]
            .querySelector('[data-row="' + (row + 1) + '"][data-col="' + col + '"]');
          if (below) below.focus();
          else {
            input.blur();
            addRow(col);
          }
        },
      });
      return input;
    }

    function columnTools(col) {
      const side = el('select', {
        class: 'select-compact', 'aria-label': t('editor.tableAlign', { n: col + 1 }),
        onchange: () => { align[col] = side.value; write(at(-1, col)); },
      }, ALIGNS.map(([value, label]) => el('option', { value }, t(label))));
      side.value = align[col];
      return el('span', { class: 'table-col-tools' },
        side,
        el('button', {
          type: 'button', class: 'icon-btn', disabled: head.length < 2,
          'aria-label': t('editor.tableRemoveColumn', { n: col + 1 }),
          onclick: () => {
            for (const cells of [head, align, ...rows]) cells.splice(col, 1);
            write(at(-1, Math.min(col, head.length - 1)));
          },
        }, icon('close')));
    }

    return el('div', { class: 'table-edit' },
      el('div', { class: 'table-edit-scroll' },
        el('table', { class: 'table-grid' },
          el('thead', {},
            el('tr', {}, columns.map((col) => el('td', {}, columnTools(col))), el('td')),
            el('tr', {}, columns.map((col) => el('th', {}, cell(head, -1, col))), el('td'))),
          el('tbody', {}, rows.map((cells, row) => el('tr', {},
            columns.map((col) => el('td', {}, cell(cells, row, col))),
            el('td', {}, el('button', {
              type: 'button', class: 'icon-btn', 'aria-label': t('editor.tableRemoveRow', { n: row + 1 }),
              onclick: () => {
                rows.splice(row, 1);
                write(at(Math.min(row, rows.length - 1), 0));
              },
            }, icon('trash')))))))),
      el('div', { class: 'row table-edit-actions' },
        el('button', {
          type: 'button', class: 'btn btn-ghost', 'aria-label': t('editor.tableAddRow'), onclick: () => addRow(0),
        }, icon('plus'), t('editor.tableRow')),
        el('button', {
          type: 'button', class: 'btn btn-ghost', 'aria-label': t('editor.tableAddColumn'),
          onclick: () => {
            head.push('');
            align.push('');
            for (const cells of rows) cells.push('');
            write(at(-1, head.length - 1));
          },
        }, icon('plus'), t('editor.tableColumn')),
        el('button', {
          type: 'button', class: 'btn btn-ghost', 'aria-label': t('editor.tableRemove'),
          onclick: () => {
            parts.splice(parts.indexOf(part), 1);
            write({ table: -1 });
            field.focus();
          },
        }, icon('trash'), t('common.delete'))));
  }

  field.addEventListener('input', () => { if (!writing) show(); });
  show();
  return root;
}

/* Puts the focus in the first cell of the table of that place under field. */
export function focusTable(field, index) {
  const cell = field.nextElementSibling?.querySelectorAll('.table-edit')[index]?.querySelector('.table-cell');
  if (cell) cell.focus();
}
