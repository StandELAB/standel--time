let
    Source = Json.Document(Web.Contents("https://time.standel.se", [RelativePath="api/v1/hours", Query=[year="2027"], Timeout=#duration(0,0,2,0)])),
    Rows = if Source[api_version] = 1 then Source[rows] else error "Unsupported API version",
    Columns = {"entry_id","employee_id","employee_name","project_id","project_name","project_code","work_date","hours","category","payroll_status","updated_at"},
    Data = Table.FromRecords(Rows, Columns, MissingField.Error),
    Typed = Table.TransformColumnTypes(Data, {{"entry_id",type text},{"employee_id",type text},{"employee_name",type text},{"project_id",type text},{"project_name",type text},{"project_code",type text},{"work_date",type date},{"hours",type number},{"category",type text},{"payroll_status",type text},{"updated_at",type datetimezone}}, "en-US"),
    Checked = if Table.RowCount(Typed) = Table.RowCount(Table.Distinct(Typed,{"entry_id"})) then Typed else error "Duplicate time entry IDs",
    Month = Table.AddColumn(Checked,"month",each Date.Month([work_date]),Int64.Type)
in
    Month
