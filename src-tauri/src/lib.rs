// Muakmuak portable: reemplazo verificado del ejecutable desde GitHub Releases.
// Sin instalador MSI/NSIS. Solo Windows, ejecutado por el usuario que abrió la app.
use tauri::Manager;

#[cfg(target_os = "windows")]
fn permitted_github_asset(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://github.com/") else { return false };
    let chunks: Vec<&str> = rest.split('/').collect();
    if chunks.len() != 6 || chunks[2] != "releases" || chunks[3] != "download"
        || chunks[5] != "Muakmuak-portable-win-x64.zip" { return false }
    // Prevent PowerShell quoting, URL redirects to arbitrary file names, and path traversal.
    if ![chunks[0], chunks[1], chunks[4]].iter().all(|segment| {
        !segment.is_empty() && segment.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        && *segment != "." && *segment != ".."
    }) { return false }
    if let Some(expected) = option_env!("MUAK_GITHUB_REPO") {
        if format!("{}/{}", chunks[0], chunks[1]) != expected { return false }
    }
    true
}

#[cfg(target_os = "windows")]
fn ps_literal(s: &str) -> String { s.replace('\'', "''") }

#[cfg(target_os = "windows")]
#[tauri::command]
fn install_portable_update(app: tauri::AppHandle, asset_url: String, sha256: String) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("Prueba las actualizaciones con el ejecutable portable compilado, no en modo tauri dev.".into());
    }
    if !permitted_github_asset(&asset_url) { return Err("URL de actualización no permitida.".into()); }
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("La publicación no contiene un SHA-256 válido.".into());
    }
    let running_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if running_exe.file_name().and_then(|n| n.to_str()).map(|s| s.to_ascii_lowercase()) != Some("muakmuak.exe".to_owned()) {
        return Err("Este actualizador requiere muakmuak.exe portable.".into());
    }
    let parent = running_exe.parent().ok_or("No se encontró la carpeta del ejecutable.")?;
    // Si se ejecuta desde una carpeta protegida, mostrar error antes de cerrar la app.
    let test_path = parent.join(".muakmuak-write-test");
    std::fs::write(&test_path, b"ok").map_err(|_| "La carpeta del programa no permite actualizaciones. Mueve la app a Documentos o Escritorio.".to_string())?;
    let _ = std::fs::remove_file(test_path);
    let pid = std::process::id();
    let unique = format!("{}_{}", pid, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs());
    let script_path = std::env::temp_dir().join(format!("muakmuak-upgrade-{unique}.ps1"));
    let script = r#"
$ErrorActionPreference = 'Stop'
$uri = '@@URL@@'
$hash = '@@HASH@@'
$target = '@@EXE@@'
$pidOld = @@PID@@
$stage = Join-Path $env:TEMP 'muakmuak-upgrade-@@UNIQUE@@'
$archive = Join-Path $stage 'package.zip'
try {
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  Write-Host 'Muakmuak: descargando actualización desde GitHub...'
  Invoke-WebRequest -Uri $uri -OutFile $archive -UseBasicParsing
  $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $hash.ToLowerInvariant()) { throw 'El paquete no coincide con la huella SHA-256 publicada en GitHub.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
  $newExe = Join-Path $stage 'muakmuak.exe'
  if (!(Test-Path -LiteralPath $newExe)) { throw 'El ZIP no contiene muakmuak.exe.' }
  $seconds = 0
  while ((Get-Process -Id $pidOld -ErrorAction SilentlyContinue) -and $seconds -lt 90) {
    Start-Sleep -Seconds 1; $seconds++
  }
  if (Get-Process -Id $pidOld -ErrorAction SilentlyContinue) { throw 'Muakmuak continúa abierto; no se reemplazó el programa.' }
  $backup = "$target.anterior"
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
  Move-Item -LiteralPath $target -Destination $backup -Force
  try { Move-Item -LiteralPath $newExe -Destination $target -Force }
  catch { Move-Item -LiteralPath $backup -Destination $target -Force; throw }
  Write-Host 'Actualización instalada. Abriendo Muakmuak...'
  Start-Process -FilePath $target
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
} catch {
  $message = $_.Exception.Message
  $log = Join-Path $env:TEMP 'muakmuak-update-error.txt'
  Set-Content -LiteralPath $log -Value $message
  Write-Host "No se pudo actualizar: $message"
  Write-Host "Detalles: $log"
  Read-Host 'Pulsa Enter para cerrar'
  exit 1
}
"#
        .replace("@@URL@@", &ps_literal(&asset_url))
        .replace("@@HASH@@", &sha256)
        .replace("@@EXE@@", &ps_literal(&running_exe.to_string_lossy()))
        .replace("@@PID@@", &pid.to_string())
        .replace("@@UNIQUE@@", &unique);
    std::fs::write(&script_path, script).map_err(|e| format!("No se pudo preparar la actualización: {e}"))?;
    std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script_path)
        .spawn()
        .map_err(|e| format!("No se pudo abrir el actualizador: {e}"))?;
    // El proceso externo espera a que termine Muakmuak antes de sustituir el EXE.
    app.exit(0);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn install_portable_update(_app: tauri::AppHandle, _asset_url: String, _sha256: String) -> Result<(), String> {
    Err("La actualización portable está disponible solo en Windows.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![install_portable_update])
        .run(tauri::generate_context!())
        .expect("Error al iniciar Muakmuak");
}
