# Session Memory

## Dev server en este entorno (PowerShell + npm)
- `Start-Process -FilePath npm -ArgumentList ...` no siempre deja Vite accesible en este setup.
- Patrón confiable: lanzar PowerShell explícito y ejecutar `npm.cmd`.
- Comando usado con éxito:
  - `Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -ArgumentList '-NoProfile','-Command','cd ''c:\AI\proyectos\dashboard-carga''; npm.cmd run dev -- --host 127.0.0.1 --port 5173'`
- Verificar disponibilidad antes de Playwright:
  - `Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing`

## Paridad ProjectTable
- Referencia funcional: `ProjectTable_Monolitic.tsx`.
- Mantener columna esencial final como `Estatus` (no `Balance`) por decisión de producto actual.
- `Sucursal` usa editor de etiquetas; opciones deben salir de unión:
  - `allBranches` (datos actuales) + `branchCatalog` (localStorage).
- Persistencia de catálogo sucursal:
  - clave: `workload-dashboard-branch-catalog:${activeBoardId || 'local'}`.

## Checks rápidos de validación
- Build: `npm run build`.
- URL principal QA: `http://127.0.0.1:5173/?board=3fb8f1ee-b2b5-4f18-92dc-59dc93210783`.
- En Playwright: validar resize de headers, menú de tipo de columna (incluye `Etiquetas`) y editor de sucursales.
