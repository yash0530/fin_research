import React, { TableHTMLAttributes, HTMLAttributes } from "react";

export function DenseTable({ className = "", children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`dense-table ui-table ${className}`} {...props}>
      {children}
    </table>
  );
}

export function TableHead({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`ui-table-head ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className = "", children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`ui-table-row ${className}`} {...props}>
      {children}
    </tr>
  );
}

interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  isHeader?: boolean;
  colSpan?: number;
}

export function TableCell({ className = "", children, numeric = false, isHeader = false, colSpan, ...props }: TableCellProps) {
  const Tag = isHeader ? "th" : "td";
  const alignmentClass = numeric ? "ui-table-cell--numeric font-mono font-tabular" : "";
  const typographyClass = isHeader ? "text-table-header ui-table-cell--header" : "text-table-row ui-table-cell";
  return (
    <Tag
      colSpan={colSpan}
      className={`${typographyClass} ${alignmentClass} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
