import { useMemo, useRef, useState } from "react";
import {
  Clock3, Trash2, Table2, LayoutGrid, Search, Plus, X, Copy, Download,
  ArrowDownUp, ChevronDown, ChevronUp, SlidersHorizontal, CalendarDays, ChevronLeft, ChevronRight, Upload, MoreHorizontal
} from "lucide-react";
import type {
  DatabaseCell, DatabaseProperty, DatabasePropertyType, DatabaseRow, WorkspaceDatabase
} from "../lib/workspace";
import { databaseCsvFileContent, importDatabaseCsv } from "../lib/csv";

type DatabaseViewProps = {
  title: string;
  icon: string;
  onIconChange: (icon: string) => void;
  updatedAt: number;
  database: WorkspaceDatabase;
  onRename: (title: string) => void;
  onDatabaseChange: (database: WorkspaceDatabase) => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onExportHtml: () => void;
  onMessage: (message: string) => void;
};

type SortState = { propertyId: string; direction: "asc" | "desc" } | null;

const defaultStatusOptions = ["Not started", "In progress", "Done"];
const pageIcons = ["📄", "✳️", "📝", "💡", "📚", "✅", "🎯", "🗓️", "💼", "🧠", "⭐", "🚀", "🌱", "🎨", "🔬", "💻", "📌", "❤️", "📈", "🧪", "🏠", "🎓", "🛠️", "🌍"];

function valueText(value: DatabaseCell | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function initialCellValue(property: DatabaseProperty): DatabaseCell {
  if (property.type === "checkbox") return false;
  if (property.type === "number") return null;
  if (property.type === "status" || property.type === "select") return property.options?.[0] ?? "";
  return "";
}

function createRow(database: WorkspaceDatabase): DatabaseRow {
  return {
    id: crypto.randomUUID(),
    cells: Object.fromEntries(database.properties.map((property) => [property.id, initialCellValue(property)]))
  };
}

export default function DatabaseView({
  title,
  icon,
  onIconChange,
  updatedAt,
  database,
  onRename,
  onDatabaseChange,
  onDuplicate,
  onTrash,
  onExportHtml,
  onMessage
}: DatabaseViewProps) {
  const [filter, setFilter] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const [addingProperty, setAddingProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<DatabasePropertyType>("text");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [editingPropertyName, setEditingPropertyName] = useState("");
  const [propertyError, setPropertyError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });

  const titleProperty = database.properties[0];
  const dateProperty = database.properties.find((property) => property.type === "date");
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [calendarMonth]);
  const formatDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const statusProperty = database.properties.find((property) => property.type === "status" || property.type === "select");
  const statusOptions = statusProperty?.options?.length
    ? statusProperty.options
    : statusProperty?.type === "status" ? defaultStatusOptions : [];
  const filteredRows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    const result = database.rows.filter((row) => !needle || database.properties.some((property) =>
      valueText(row.cells[property.id]).toLocaleLowerCase().includes(needle)
    ));
    if (!sort) return result;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...result].sort((left, right) => {
      const a = left.cells[sort.propertyId];
      const b = right.cells[sort.propertyId];
      if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
      return valueText(a).localeCompare(valueText(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [database.rows, database.properties, filter, sort]);

  const updateCell = (rowId: string, propertyId: string, value: DatabaseCell) => {
    onDatabaseChange({
      ...database,
      rows: database.rows.map((row) => row.id === rowId
        ? { ...row, cells: { ...row.cells, [propertyId]: value } }
        : row)
    });
  };

  const addRow = () => onDatabaseChange({ ...database, rows: [...database.rows, createRow(database)] });

  const exportCsv = () => {
    const blob = new Blob([databaseCsvFileContent(database)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = title.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "database";
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onMessage("CSV files must be 5 MB or smaller.");
      return;
    }
    try {
      const updated = importDatabaseCsv(await file.text(), database);
      const importedRows = updated.rows.length - database.rows.length;
      onDatabaseChange(updated);
      onMessage("CSV imported: " + importedRows + " " + (importedRows === 1 ? "row" : "rows") + " added.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not import this CSV file.");
    }
  };

  const deleteRow = (rowId: string) => onDatabaseChange({
    ...database,
    rows: database.rows.filter((row) => row.id !== rowId)
  });

  const addProperty = () => {
    const name = newPropertyName.trim();
    if (!name) {
      setPropertyError("Enter a property name.");
      return;
    }
    if (database.properties.some((property) => property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setPropertyError("A property with that name already exists.");
      return;
    }
    const property: DatabaseProperty = {
      id: crypto.randomUUID(),
      name,
      type: newPropertyType,
      ...((newPropertyType === "status" || newPropertyType === "select")
        ? { options: newPropertyType === "status" ? defaultStatusOptions : ["Option 1", "Option 2"] }
        : {})
    };
    onDatabaseChange({
      ...database,
      properties: [...database.properties, property],
      rows: database.rows.map((row) => ({ ...row, cells: { ...row.cells, [property.id]: initialCellValue(property) } }))
    });
    setNewPropertyName("");
    setNewPropertyType("text");
    setPropertyError("");
    setAddingProperty(false);
  };

  const commitPropertyRename = (propertyId: string) => {
    const currentProperty = database.properties.find((property) => property.id === propertyId);
    const name = editingPropertyName.trim();
    setEditingPropertyId(null);
    if (!currentProperty) return;
    if (!name) {
      setEditingPropertyName(currentProperty.name);
      setPropertyError("Property names cannot be empty.");
      return;
    }
    if (database.properties.some((property) => property.id !== propertyId && property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setEditingPropertyName(currentProperty.name);
      setPropertyError("A property with that name already exists.");
      return;
    }
    if (name !== currentProperty.name) {
      onDatabaseChange({
        ...database,
        properties: database.properties.map((property) => property.id === propertyId ? { ...property, name } : property)
      });
    }
    setPropertyError("");
  };

  const deleteProperty = (propertyId: string) => {
    if (database.properties.length <= 1) return;
    onDatabaseChange({
      ...database,
      properties: database.properties.filter((property) => property.id !== propertyId),
      rows: database.rows.map((row) => {
        const cells = { ...row.cells };
        delete cells[propertyId];
        return { ...row, cells };
      })
    });
    if (sort?.propertyId === propertyId) setSort(null);
  };

  const changeView = (view: WorkspaceDatabase["view"]) => onDatabaseChange({ ...database, view });

  const addEntryForDate = (date: Date) => {
    if (!dateProperty) {
      setAddingProperty(true);
      setNewPropertyType("date");
      setNewPropertyName("Date");
      setPropertyError("");
      return;
    }
    const row = createRow(database);
    row.cells[dateProperty.id] = formatDateKey(date);
    onDatabaseChange({ ...database, rows: [...database.rows, row] });
  };

  const toggleSort = (propertyId: string) => {
    setSort((current) => current?.propertyId === propertyId
      ? { propertyId, direction: current.direction === "asc" ? "desc" : "asc" }
      : { propertyId, direction: "asc" });
  };

  const renderCell = (row: DatabaseRow, property: DatabaseProperty) => {
    const value = row.cells[property.id];
    const label = `${property.name} for ${valueText(row.cells[titleProperty?.id ?? ""]) || "untitled row"}`;
    if (property.type === "checkbox") {
      return <input className="database-checkbox" type="checkbox" checked={value === true} onChange={(event) => updateCell(row.id, property.id, event.target.checked)} aria-label={label} />;
    }
    if (property.type === "status" || property.type === "select") {
      const options = property.options?.length ? property.options : property.type === "status" ? defaultStatusOptions : [];
      return <select className="database-cell-input" value={valueText(value)} onChange={(event) => updateCell(row.id, property.id, event.target.value)} aria-label={label}>
        <option value="">Not set</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>;
    }
    if (property.type === "date") {
      return <input className="database-cell-input" type="date" value={valueText(value)} onChange={(event) => updateCell(row.id, property.id, event.target.value)} aria-label={label} />;
    }
    if (property.type === "number") {
      return <input className="database-cell-input" type="number" value={typeof value === "number" ? value : ""} onChange={(event) => updateCell(row.id, property.id, event.target.value === "" ? null : Number(event.target.value))} aria-label={label} />;
    }
    const textInput = <input className={`database-cell-input ${property === titleProperty ? "database-title-cell" : ""}`} type="text" value={valueText(value)} onChange={(event) => updateCell(row.id, property.id, event.target.value)} aria-label={label} placeholder={property === titleProperty ? "Untitled" : "Empty"} />;
    return property === titleProperty
      ? <div className="database-title-cell-wrap"><span aria-hidden="true">📄</span>{textInput}</div>
      : textInput;
  };

  const statusValue = (row: DatabaseRow) => valueText(statusProperty ? row.cells[statusProperty.id] : undefined);
  const boardGroups = statusProperty ? [...statusOptions, "__no_status__"] : [];

  return (
    <article className="document database-document">
      <div className="page-actions-row">
        <div className="page-icon-picker-wrap"><button type="button" className="page-icon-large page-icon-picker-trigger" aria-label="Change database icon" aria-expanded={iconPickerOpen} onClick={() => setIconPickerOpen((value) => !value)}>{icon || "🗃️"}</button>{iconPickerOpen && <div className="page-icon-picker" role="group" aria-label="Choose database icon">{pageIcons.map((option) => <button key={option} type="button" className={icon === option ? "chosen" : ""} aria-label={`Use ${option} as database icon`} onClick={() => { onIconChange(option); setIconPickerOpen(false); }}>{option}</button>)}</div>}</div>
        <div className="page-actions">
          <span className="saved-label"><span className="status-dot" /> Saved locally</span>
          <button className="icon-button" onClick={onDuplicate} aria-label="Duplicate database" title="Duplicate database"><Copy size={15} /></button>
          <button className="icon-button" onClick={onTrash} aria-label="Move database to trash"><Trash2 size={16} /></button>
        </div>
      </div>
      <input className="document-title" value={title} onChange={(event) => onRename(event.target.value)} aria-label="Database page title" placeholder="Untitled database" />
      <div className="document-meta">
        <span><Clock3 size={12} /> Edited {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(updatedAt)}</span>
        <span className="meta-divider">·</span><span>{database.rows.length} {database.rows.length === 1 ? "entry" : "entries"} · Local database</span>
      </div>

      <div className="database-toolbar">
        <div className="database-view-switch" role="group" aria-label="Database view">
          <button className={database.view === "table" ? "active" : ""} aria-pressed={database.view === "table"} onClick={() => changeView("table")}><Table2 size={14} /> Table</button>
          <button className={database.view === "board" ? "active" : ""} aria-pressed={database.view === "board"} onClick={() => changeView("board")}><LayoutGrid size={14} /> Board</button>
          <button className={database.view === "calendar" ? "active" : ""} aria-pressed={database.view === "calendar"} onClick={() => changeView("calendar")}><CalendarDays size={14} /> Calendar</button>
        </div>
        <label className="database-filter"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter database entries" placeholder="Filter entries..." /></label>
        <button className="database-action-button" onClick={() => { setAddingProperty((value) => !value); setPropertyError(""); }}><SlidersHorizontal size={14} /> Property</button>
        <div className="database-more-wrap">
          <button className="database-action-button database-more-trigger" aria-label="More database actions" aria-expanded={actionsOpen} title="More database actions" onClick={() => setActionsOpen(value => !value)}><MoreHorizontal size={16} /></button>
          {actionsOpen && <div className="database-more-menu" role="menu" aria-label="More database actions">
            <button role="menuitem" onClick={() => { onExportHtml(); setActionsOpen(false); }}><Download size={14} /> Export HTML</button>
            <button role="menuitem" onClick={() => { exportCsv(); setActionsOpen(false); }}><Download size={14} /> Export CSV</button>
            <button role="menuitem" onClick={() => { csvFileInputRef.current?.click(); setActionsOpen(false); }}><Upload size={14} /> Import CSV</button>
          </div>}
        </div>
        <input ref={csvFileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { void importCsv(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        <button className="database-action-button primary" onClick={addRow}><Plus size={14} /> New</button>
      </div>

      {addingProperty && <form className="database-property-form" onSubmit={(event) => { event.preventDefault(); addProperty(); }}>
        <label>Property name<input autoFocus value={newPropertyName} onChange={(event) => { setNewPropertyName(event.target.value); setPropertyError(""); }} placeholder="e.g. Priority" /></label>
        <label>Type<select value={newPropertyType} onChange={(event) => setNewPropertyType(event.target.value as DatabasePropertyType)}>
          <option value="text">Text</option><option value="status">Status</option><option value="select">Select</option><option value="date">Date</option><option value="number">Number</option><option value="checkbox">Checkbox</option>
        </select></label>
        <button type="submit" className="database-action-button primary">Add property</button>
        <button type="button" className="database-action-button" onClick={() => { setAddingProperty(false); setPropertyError(""); }}>Cancel</button>
        {propertyError && <span className="database-property-error" role="alert">{propertyError}</span>}
      </form>}

      {propertyError && !addingProperty && <div className="database-property-error database-property-error-banner" role="alert">{propertyError}</div>}

      {database.view === "table" ? <div className="database-table-wrap">
        <table className="database-table">
          <thead><tr>
            {database.properties.map((property) => <th key={property.id}>
              {editingPropertyId === property.id ? <input
                className="database-property-rename"
                value={editingPropertyName}
                autoFocus
                aria-label={`Rename ${property.name} property`}
                onChange={(event) => setEditingPropertyName(event.target.value)}
                onBlur={() => commitPropertyRename(property.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { setEditingPropertyName(property.name); setEditingPropertyId(null); setPropertyError(""); }
                }}
              /> : <button className="database-sort-button" onClick={() => toggleSort(property.id)} onDoubleClick={() => { setEditingPropertyId(property.id); setEditingPropertyName(property.name); setPropertyError(""); }} title="Double-click to rename" aria-label={`Sort by ${property.name}; double-click to rename`}>
                <span>{property.name}</span>
                {sort?.propertyId === property.id ? (sort.direction === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowDownUp size={11} />}
              </button>}
              <button className="database-delete-property" disabled={database.properties.length <= 1} onClick={() => deleteProperty(property.id)} aria-label={`Delete ${property.name} property`} title="Delete property"><X size={12} /></button>
            </th>)}
            <th className="database-row-actions-heading" aria-label="Row actions" />
          </tr></thead>
          <tbody>
            {filteredRows.map((row) => <tr key={row.id}>
              {database.properties.map((property) => <td key={property.id}>{renderCell(row, property)}</td>)}
              <td className="database-row-actions"><button onClick={() => deleteRow(row.id)} aria-label="Delete row" title="Delete row"><Trash2 size={13} /></button></td>
            </tr>)}
            {filteredRows.length === 0 && <tr><td className="database-empty-cell" colSpan={database.properties.length + 1}>{filter ? "No entries match this filter." : "No entries yet. Create a row to get started."}</td></tr>}
          </tbody>
        </table>
      </div> : database.view === "board" ? <div className="database-board">
        {!statusProperty ? <div className="database-board-empty"><div className="database-empty-symbol">▦</div><strong>Board view needs a Status or Select property</strong><span>Add a property to group entries into columns.</span><button className="database-action-button primary" onClick={() => { setAddingProperty(true); setNewPropertyType("status"); setPropertyError(""); }}>Add status property</button></div> :
          boardGroups.map((group) => {
            const groupRows = filteredRows.filter((row) => group === "__no_status__" ? !statusValue(row) : statusValue(row) === group);
            return <section className="database-board-column" key={group}>
              <header><span className="database-board-dot" /> <strong>{group === "__no_status__" ? "No status" : group}</strong><span className="database-board-count">{groupRows.length}</span></header>
              <div className="database-board-cards">
                {groupRows.map((row) => <article className="database-board-card" key={row.id}>
                  <strong>{valueText(row.cells[titleProperty?.id ?? ""]) || "Untitled entry"}</strong>
                  {database.properties.filter((property) => property.id !== titleProperty?.id && property.id !== statusProperty.id && valueText(row.cells[property.id])).slice(0, 3).map((property) => <span className="database-board-detail" key={property.id}>{property.name}: {valueText(row.cells[property.id])}</span>)}
                  <div className="database-board-card-actions">
                    <select value={statusValue(row)} onChange={(event) => updateCell(row.id, statusProperty.id, event.target.value)} aria-label={`Status for ${valueText(row.cells[titleProperty?.id ?? ""]) || "untitled entry"}`}>
                      <option value="">No status</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <button onClick={() => deleteRow(row.id)} aria-label="Delete entry"><Trash2 size={13} /></button>
                  </div>
                </article>)}
                <button className="database-board-add" onClick={() => {
                  const row = createRow(database);
                  row.cells[statusProperty.id] = group === "__no_status__" ? "" : group;
                  onDatabaseChange({ ...database, rows: [...database.rows, row] });
                }}><Plus size={13} /> Add entry</button>
              </div>
            </section>;
          })}
      </div> : <div className="database-calendar">
        <div className="database-calendar-toolbar">
          <strong>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(calendarMonth)}</strong>
          <div>
            <button className="database-action-button" aria-label="Previous month" title="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
            <button className="database-action-button" onClick={() => { const now = new Date(); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button>
            <button className="database-action-button" aria-label="Next month" title="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
          </div>
        </div>
        {!dateProperty ? <div className="database-board-empty"><div className="database-empty-symbol"><CalendarDays size={25} /></div><strong>Calendar view needs a Date property</strong><span>Add a date property to place entries on the calendar.</span><button className="database-action-button primary" onClick={() => { setAddingProperty(true); setNewPropertyType("date"); setNewPropertyName("Date"); setPropertyError(""); }}>Add date property</button></div> :
          <div className="database-calendar-scroll">
            <div className="database-calendar-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="database-calendar-weekday" key={day}>{day}</div>)}
              {calendarDays.map((day) => {
                const key = formatDateKey(day);
                const entries = filteredRows.filter((row) => valueText(row.cells[dateProperty.id]) === key);
                const inMonth = day.getMonth() === calendarMonth.getMonth();
                const isToday = key === formatDateKey(new Date());
                return <div className={`database-calendar-day ${inMonth ? "" : "outside-month"} ${isToday ? "today" : ""}`} key={key}>
                  <div className="database-calendar-day-heading"><span>{day.getDate()}</span><button onClick={() => addEntryForDate(day)} aria-label={`Add entry on ${key}`} title="Add entry"><Plus size={13} /></button></div>
                  <div className="database-calendar-entries">
                    {entries.slice(0, 3).map((row) => <button className="database-calendar-entry" key={row.id} title={valueText(row.cells[titleProperty?.id ?? ""]) || "Untitled entry"} onClick={() => changeView("table")}>{valueText(row.cells[titleProperty?.id ?? ""]) || "Untitled entry"}</button>)}
                    {entries.length > 3 && <span className="database-calendar-more">+{entries.length - 3} more</span>}
                  </div>
                </div>;
              })}
            </div>
          </div>}
      </div>}
      <div className="database-footer"><span>{filteredRows.length} of {database.rows.length} entries</span><span>Edits save automatically on this device</span></div>
    </article>
  );
}
