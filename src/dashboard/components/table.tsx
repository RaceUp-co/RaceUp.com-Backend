import type { FC } from 'hono/jsx';
import type { HtmlEscapedString } from 'hono/utils/html';

// Contenu d'une cellule. SECURITE : une chaine simple est TOUJOURS echappee (texte).
// Pour produire du HTML, utiliser le gabarit `html` de hono/html, qui echappe
// automatiquement chaque valeur interpolee : html`<a href="/x/${id}">${nom}</a>`.
export type CellContent =
  | string
  | number
  | null
  | undefined
  | HtmlEscapedString
  | Promise<HtmlEscapedString>;

type Column = {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => CellContent;
};

type TableProps = {
  columns: Column[];
  rows: Record<string, unknown>[];
  rowClass?: (row: Record<string, unknown>) => string;
};

type PaginationProps = {
  basePath: string;
  page: number;
  total: number;
  limit: number;
  queryParams?: string;
};

// HTML deja echappe (produit par html`` / raw()) : objet String marque isEscaped.
function isEscapedHtml(value: unknown): value is HtmlEscapedString {
  return value instanceof String && (value as { isEscaped?: boolean }).isEscaped === true;
}

function toCell(value: unknown): CellContent {
  if (isEscapedHtml(value) || typeof value === 'number') return value;
  // html`` peut renvoyer une promesse (interpolations asynchrones) : rendue par JSX une fois resolue
  if (value instanceof Promise) return value as Promise<HtmlEscapedString>;
  return String(value ?? '-');
}

export const DataTable: FC<TableProps> = ({ columns, rows, rowClass }) => {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colspan={columns.length} style="text-align:center;color:#707090;padding:20px;">
              Aucune donnee
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr class={rowClass ? rowClass(row) : ''}>
              {columns.map((col) => (
                <td>{toCell(col.render ? col.render(row[col.key], row) : row[col.key])}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export const Pagination: FC<PaginationProps> = ({ basePath, page, total, limit, queryParams }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const qs = queryParams ? `&${queryParams}` : '';

  return (
    <div class="pagination">
      <a
        href={`${basePath}?page=${page - 1}${qs}`}
        class={page <= 1 ? 'disabled' : ''}
      >
        &laquo; Prec
      </a>
      <span class="current">
        Page {page} / {totalPages} ({total} resultats)
      </span>
      <a
        href={`${basePath}?page=${page + 1}${qs}`}
        class={page >= totalPages ? 'disabled' : ''}
      >
        Suiv &raquo;
      </a>
    </div>
  );
};
