# Muakmuak: publicar el portable en GitHub (Windows)

El público descarga un ZIP con **muakmuak.exe**. No necesita instalar Node, Rust, VS Code ni GitHub Desktop. Windows sí debe tener WebView2 (normalmente viene con Windows 10/11 moderno).

## Una sola vez: publicar el proyecto

1. Abre GitHub Desktop e inicia sesión en GitHub.
2. Menú **File > Add local repository**, selecciona la carpeta `Muakmuak` que contiene `package.json`.
3. Si GitHub Desktop indica que aún no es un repositorio Git, elige **Create a Repository Here**.
4. Verifica que GitHub Desktop **NO incluya** `node_modules`, `src-tauri/target`, `dist` ni respaldos con datos personales. El `.gitignore` de Tauri normalmente ya los excluye.
5. En **Summary** escribe `Primera versión de Muakmuak`, pulsa **Commit to main**.
6. Pulsa **Publish repository**; si quieres que cualquiera descargue la app, **desmarca Keep this code private**.
7. Publica el código. Esta carpeta contiene `.github/workflows/portable-release.yml`, que compilará Windows en GitHub cuando publiques una etiqueta de versión.

## Primera versión portable v0.1.0

1. Revisa que el valor `version` en `src-tauri/tauri.conf.json` sea `0.1.0`. La etiqueta debe coincidir.
2. Abre el sitio de tu repositorio en GitHub desde el botón **View on GitHub** de GitHub Desktop.
3. En la sección **Releases**, pulsa **Create a new release** (o **Draft a new release**).
4. En **Choose a tag**, escribe `v0.1.0` y elige **Create new tag: v0.1.0 on publish**. El objetivo debe ser la rama main.
5. Título: `Muakmuak v0.1.0`, añade una descripción y pulsa **Publish release**.
6. En la pestaña **Actions** de tu repositorio aparecerá **Muakmuak portable para Windows**. Si GitHub pide permiso para ejecutar workflows, actívalo.
7. Cuando termine correctamente, vuelve a **Releases**: estará el archivo `Muakmuak-portable-win-x64.zip` con el ejecutable.
8. Comparte a los usuarios el enlace a la sección Releases de tu repositorio, no al código fuente (`Source code.zip`).

> GitHub Actions usa servidores Windows de GitHub para compilar. No necesitas tener Rust instalado en la computadora de tus usuarios. Puede que el repositorio necesite habilitar Actions; GitHub tiene cuotas y políticas de uso.

## Publicar actualizaciones (ejemplo v0.2.0)

1. Sigue editando la app en VS Code. Cambia a `0.2.0` el valor `version` de `src-tauri/tauri.conf.json`.
2. En tu terminal de `Muakmuak`, ejecuta `npm.cmd pkg set version=0.2.0` y `npm.cmd install --package-lock-only` para sincronizar package.json y package-lock.json.
3. GitHub Desktop mostrará los archivos cambiados. Escribe `Muakmuak 0.2.0` en **Summary**, pulsa **Commit to main** y luego **Push origin**.
4. En GitHub web publica un nuevo Release con nueva etiqueta `v0.2.0`, apuntando a main. Al completarse la compilación aparecerá el ZIP nuevo.
5. Los usuarios de la versión anterior abren **Flor → Preferencias → Buscar actualizaciones**. Si GitHub muestra un ZIP portable con SHA-256, aparece **Actualizar y reiniciar**.
6. Al aprobarlo, Muakmuak cierra la app, descarga y verifica el ZIP, sustituye solo `muakmuak.exe` y vuelve a abrirlo. No reemplaza ni elimina la carpeta WebView2 con perfiles/canciones.

La comprobación del repositorio se configura automáticamente **si el `.exe` se compiló desde el workflow incluido**. En modo desarrollo (`npm run tauri dev`) puedes introducir el repositorio manualmente, pero no reemplazar el ejecutable de desarrollo.

## Datos y copias de seguridad

- Conserva `identifier: "com.muakmuak.app"` en Tauri y los mismos nombres de perfil/almacenamiento a través de versiones.
- En Windows, los datos del navegador interno suelen guardarse bajo `%LOCALAPPDATA%/com.muakmuak.app/EBWebView/`. No se guardan en el archivo EXE que se reemplaza.
- Los perfiles y sus ELO utilizan localStorage; las canciones de cada perfil utilizan IndexedDB.
- **Exportar respaldo** desde la app guarda los datos de perfiles, pero no los audios importados. No desinstales WebView2 ni borres los datos de la aplicación. Para mover el progreso a otro PC, hay que migrar los datos y audios de manera específica.
- Al borrar una cuenta, la v10 elimina también la música vinculada a esa cuenta de la base local.
- La app es portable **en ejecución**, pero no garantiza independencia total de los componentes Windows: si falta WebView2, necesitará instalarse.
- No se pueden actualizar los bytes de un proceso en ejecución. El actualizador usa un proceso auxiliar de PowerShell del propio Windows y guarda el `.exe` anterior como `muakmuak.exe.anterior`.

## Solución de problemas

- Si falla la compilación en GitHub, abre **Actions > Muakmuak portable para Windows > build-windows-portable** y copia el error de los registros.
- Si dice "No hay versión": comprueba que `Releases` tenga la etiqueta correcta y un archivo llamado exactamente `Muakmuak-portable-win-x64.zip`.
- Si no aparece "Actualizar": la versión del Release debe ser superior a la instalada, y el asset debe exponer una huella SHA-256.
- Si el botón no actualiza: mueve la app a una carpeta de usuario con permisos de escritura, no `C:\\Program Files`.
- Si un antivirus alerta sobre un ejecutable nuevo sin firma, no lo eludas ciegamente: considera firmar la aplicación para distribución pública.
