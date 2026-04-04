import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

type Column = {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => string;
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
                <td>
                  {col.render
                    ? html([col.render(row[col.key], row)] as unknown as TemplateStringsArray)
                    : String(row[col.key] ?? '-')}
                </td>
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
