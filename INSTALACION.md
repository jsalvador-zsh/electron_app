# ZKTeco Desktop — Guía Completa de Instalación y Configuración de Red

## Índice
1. [Requisitos del sistema](#requisitos)
2. [Instalación en modo desarrollo](#desarrollo)
3. [Generar instalador para distribución](#distribución)
4. [Conexión a dispositivos ZKTeco K30](#conexión-zkteco)
5. [Configuración de red local](#red-local)
6. [Acceso remoto: VPN con WireGuard](#wireguard)
7. [Alternativas: Port Forwarding y Túneles](#alternativas)
8. [Solución de problemas](#solución-de-problemas)

---

## 1. Requisitos del sistema

### Para la computadora donde correrá ZKTeco Desktop

| Componente | Requerimiento |
|-----------|---------------|
| SO | Windows 10/11 (64-bit) |
| RAM | 4 GB mínimo |
| Espacio | 500 MB |
| Red | Conectividad TCP/UDP al puerto 4370 del reloj |
| Node.js | v18 LTS o superior (solo en desarrollo) |
| Python | 3.8+ con pyzk y pytz (solo en desarrollo) |

### Para el instalador generado (`.exe`)
El instalador incluye todo lo necesario — **no requiere Python ni Node.js** en la máquina destino.

---

## 2. Instalación en modo desarrollo

### Paso 1: Instalar Node.js
Descarga desde: https://nodejs.org/en/download (versión LTS)

Verifica: `node --version` → debe mostrar v18 o superior

### Paso 2: Instalar Python
Descarga desde: https://python.org/downloads

⚠️ **IMPORTANTE:** Durante la instalación, marca "Add Python to PATH"

Verifica: `python --version` → debe mostrar 3.8 o superior

### Paso 3: Instalar dependencias Python
```cmd
pip install pyzk pytz
```

### Paso 4: Instalar y correr la app
```cmd
cd electron_app
npm install
npm start
```

O simplemente ejecuta `install-and-run.bat` y hace todo automáticamente.

---

## 3. Generar instalador para distribución

Este proceso genera un `.exe` que se puede instalar en cualquier PC sin Node.js ni Python:

```cmd
cd electron_app
build-installer.bat
```

El proceso:
1. Compila `python/zk_connector.py` → `python/zk_connector.exe` (PyInstaller)
2. Ejecuta `npm install`
3. Genera `dist-electron/ZKTeco Desktop Setup X.X.X.exe` (electron-builder)

El instalador resultante incluye todo, incluido el conector Python compilado.

---

## 4. Conexión a dispositivos ZKTeco K30

### Protocolo de comunicación
El ZKTeco K30 usa el **protocolo ZKIP** sobre:
- **UDP/4370** (por defecto, más rápido)
- **TCP/4370** (como respaldo)

La app intenta primero TCP y luego UDP automáticamente.

### Configurar la IP del dispositivo

En el **reloj biométrico** (menú físico):
```
Menu → Sistema → Conf. Red
  ├── IP Address: 192.168.1.100  (IP fija recomendada)
  ├── Subnet Mask: 255.255.255.0
  ├── Gateway: 192.168.1.1
  ├── DHCP: OFF  ← IMPORTANTE: desactivar DHCP
  └── Port: 4370
```

### Agregar el dispositivo en la app
1. Ir a **Dispositivos** → Agregar dispositivo
2. Ingresar:
   - **Nombre:** Reloj Entrada Principal
   - **IP:** 192.168.1.100  (la IP que configuraste en el reloj)
   - **Puerto:** 4370
   - **Contraseña:** 0 (si no configuraste contraseña en el reloj)
3. Click en "Probar conexión" para verificar

---

## 5. Configuración de red local

### Escenario A: PC y reloj en la misma red

```
[PC con ZKTeco Desktop] ─────── [Switch/Router] ─────── [Reloj ZKTeco K30]
    192.168.1.10                                              192.168.1.100
```

**Verificar conectividad desde la PC:**
```cmd
ping 192.168.1.100
```

Si el ping falla, revisar:
- Cable de red o WiFi del reloj
- IP configurada correctamente en el reloj
- Firewall de Windows (ver abajo)

### Abrir el puerto 4370 en el Firewall de Windows
```powershell
# Ejecutar como Administrador
New-NetFirewallRule -DisplayName "ZKTeco K30" -Direction Inbound -Protocol UDP -LocalPort 4370 -Action Allow
New-NetFirewallRule -DisplayName "ZKTeco K30 TCP" -Direction Inbound -Protocol TCP -LocalPort 4370 -Action Allow
```

O manualmente:
```
Panel de Control → Firewall de Windows → Reglas de entrada
→ Nueva Regla → Puerto → TCP y UDP → Puerto específico: 4370 → Permitir
```

### Escenario B: PC en una red, reloj en otra

Necesitas un **túnel** o **VPN**. Ver sección 6 y 7.

---

## 6. Acceso remoto: VPN con WireGuard ⭐ RECOMENDADO

WireGuard es la solución **más moderna, segura y simple** para acceder remotamente al reloj.

### ¿Por qué WireGuard?
- Latencia ultra baja (importante para el protocolo ZKTeco UDP)
- Fácil configuración
- Sin costo
- Funciona en Windows, Linux, macOS, Android, iOS

### Arquitectura recomendada

```
[PC remota] ─── Internet ─── [Servidor VPN WireGuard] ─── LAN ─── [Reloj ZKTeco]
192.168.100.2  :51820        10.0.0.1 / 192.168.1.1                 192.168.1.100
```

El servidor WireGuard puede ser:
- Un servidor VPS (DigitalOcean, Linode, AWS)
- La misma computadora principal con IP pública
- Un router que soporte WireGuard (ej. pfSense, OPNsense, MikroTik)

---

### Instalación de WireGuard

#### Servidor (Linux Ubuntu/Debian)
```bash
apt update && apt install -y wireguard

# Generar claves del servidor
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key

SERVER_PRIVATE=$(cat /etc/wireguard/server_private.key)
SERVER_PUBLIC=$(cat /etc/wireguard/server_public.key)
echo "Clave pública servidor: $SERVER_PUBLIC"
```

**Archivo de configuración del servidor** `/etc/wireguard/wg0.conf`:
```ini
[Interface]
PrivateKey = <SERVER_PRIVATE_KEY>
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Cliente 1: PC de administración
[Peer]
PublicKey = <CLIENT1_PUBLIC_KEY>
AllowedIPs = 10.8.0.2/32

# Cliente 2: PC de RRHH
[Peer]
PublicKey = <CLIENT2_PUBLIC_KEY>
AllowedIPs = 10.8.0.3/32
```

Activar y arrancar:
```bash
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Ver estado
wg show
```

Abrir puerto en firewall del servidor:
```bash
ufw allow 51820/udp
```

#### Cliente Windows (PC donde está la app)

1. Descargar WireGuard para Windows: https://www.wireguard.com/install/
2. Instalar y abrir WireGuard
3. Click en **"Añadir túnel"** → **"Crear nuevo túnel"**
4. Configurar:

```ini
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>   # generado automáticamente al crear túnel
Address = 10.8.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = <IP_PUBLICA_SERVIDOR>:51820
AllowedIPs = 10.8.0.0/24, 192.168.1.0/24   # ← incluye la red del reloj
PersistentKeepalive = 25
```

> `AllowedIPs = 192.168.1.0/24` le dice a WireGuard que el tráfico hacia 192.168.1.x
> debe pasar por el túnel (donde está el reloj en 192.168.1.100)

5. Tomar la **clave pública** del cliente y agregarla al `[Peer]` del servidor
6. Click **"Activar"** en WireGuard
7. Probar: `ping 192.168.1.100` (debe responder desde la red del reloj)

#### En la app ZKTeco Desktop:
Configurar el dispositivo con la IP del reloj `192.168.1.100` — la VPN hace el resto de forma transparente.

---

### WireGuard con servidor en Windows (sin VPS)

Si el servidor con acceso al reloj tiene IP pública (o puerto redireccionado):

1. Instalar WireGuard en Windows Server
2. Crear túnel igual que el cliente pero asignando `Address = 10.8.0.1/24`
3. Habilitar IP Forwarding en Windows:
```powershell
# Habilitar routing (ejecutar como Admin)
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "IPEnableRouter" -Value 1
Restart-Service -Name "RemoteAccess" -ErrorAction SilentlyContinue
```

---

## 7. Alternativas: Port Forwarding y Túneles

### Opción A: Port Forwarding (reenvío de puertos en el router)

Si el router tiene IP pública estática y acceso al reloj:

1. Entrar al panel del router (normalmente http://192.168.1.1)
2. Buscar: **NAT / Port Forwarding / Virtual Server**
3. Agregar regla:
   ```
   Protocolo:   UDP + TCP
   Puerto externo: 4370
   IP interna:     192.168.1.100  (IP del reloj)
   Puerto interno: 4370
   ```
4. En la app, configurar el dispositivo con la **IP pública del router**

⚠️ **Desventajas:** El puerto 4370 quedará expuesto a Internet. Combinar con restricción de IP en el router.

### Opción B: ngrok (túnel temporal, para pruebas)

```cmd
# Instalar ngrok
winget install ngrok.ngrok

# Crear túnel TCP (desde la PC que tiene acceso al reloj)
ngrok tcp 4370

# Obtendrás algo como: tcp://0.tcp.ngrok.io:12345
# Configura en la app: IP = 0.tcp.ngrok.io, Puerto = 12345
```

⚠️ Puerto cambia en cada sesión. No recomendado para producción.

### Opción C: Tailscale (WireGuard gestionado, sin servidor propio)

Tailscale es la forma **más fácil** de conectar PCs remotas al reloj:

1. Instalar Tailscale en la PC del reloj: https://tailscale.com/download/windows
2. Instalar Tailscale en la PC remota
3. Ambas PCs verán una IP `100.x.x.x` de Tailscale
4. En la app, usar la IP Tailscale de la PC donde está el reloj

```
[PC remota]  ──── Tailscale ────  [PC con reloj]  ──── LAN ──── [Reloj ZKTeco]
100.64.0.2                        100.64.0.1                     192.168.1.100
```

Para esto, usa la app en la PC principal (la que está en la misma LAN que el reloj), y accede remotamente a esa PC mediante escritorio remoto (RDP).

### Opción D: SSH Tunnel

Si tienes un servidor Linux con acceso a la red del reloj:

```bash
# Desde la PC remota: crear túnel al puerto 4370 del reloj
ssh -L 14370:192.168.1.100:4370 usuario@servidor.com

# En la app: IP = 127.0.0.1, Puerto = 14370
```

---

## 8. Solución de problemas

### "Python no encontrado"
- Instala Python 3.8+ desde https://python.org
- Marca "Add Python to PATH" durante la instalación
- Reinicia la app
- Si usas el instalador de distribución, ya incluye Python compilado

### "Connection refused" o timeout al probar dispositivo
Causas comunes:
1. **IP incorrecta** — verifica en el menú del reloj
2. **Puerto bloqueado** — agrega regla en Windows Firewall (puerto 4370 UDP+TCP)
3. **DHCP activo en el reloj** — la IP puede haber cambiado; configura IP estática
4. **Red diferente** — PC y reloj deben estar en la misma subred (o usar VPN)
5. **Antivirus** — algunos antivirus bloquean UDP. Agrega excepción para la app

### Diagnóstico rápido desde CMD:
```cmd
:: Verificar conectividad básica
ping 192.168.1.100

:: Verificar puerto (requiere nmap o telnet)
telnet 192.168.1.100 4370

:: Si no tienes telnet:
Test-NetConnection -ComputerName 192.168.1.100 -Port 4370
```

### "No se encontraron empleados"
El reloj puede tener IDs pero sin nombres registrados. Usa "Importar desde dispositivo" en la pantalla de Empleados, y luego edita los nombres.

### Registros duplicados
La app detecta duplicados por (device_id + employee_id + timestamp). Si ves duplicados, puede ser que:
- El mismo empleado esté en dos dispositivos con el mismo ID
- Timezone incorrecto (los timestamps UTC diffieren)

### Exportar Excel falla
Verifica que no tengas el archivo abierto en Excel al guardar.

---

## Resumen de puertos y protocolos

| Servicio | Puerto | Protocolo | Dirección |
|---------|--------|-----------|-----------|
| ZKTeco K30 | 4370 | UDP (preferido) + TCP | Entrada/Salida |
| WireGuard VPN | 51820 | UDP | Entrada en servidor |
| Tailscale | Automático | UDP | Gestionado |
| SSH Tunnel | 22 | TCP | Hacia servidor SSH |

---

## Checklist de instalación en PC nueva

- [ ] Windows 10/11 64-bit
- [ ] Instalar desde `ZKTeco Desktop Setup.exe`
- [ ] Abrir la app → ir a Dispositivos → Agregar dispositivo
- [ ] Ingresar IP del reloj (ej: 192.168.1.100), puerto 4370
- [ ] Probar conexión ✓
- [ ] Importar empleados desde el dispositivo
- [ ] Ir a Configuración → ajustar zona horaria y horario laboral
- [ ] Sincronizar registros del mes
- [ ] Calcular planilla en la sección Planillas

---

*ZKTeco Desktop v1.0.0 | Gomaflex*
