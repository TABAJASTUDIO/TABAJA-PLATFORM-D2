$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PcscNative {
  public const uint SCARD_SCOPE_USER = 0;
  public const uint SCARD_SHARE_SHARED = 2;
  public const uint SCARD_PROTOCOL_T0 = 1;
  public const uint SCARD_PROTOCOL_T1 = 2;
  public const uint SCARD_LEAVE_CARD = 0;
  [StructLayout(LayoutKind.Sequential)] public struct SCARD_IO_REQUEST { public uint dwProtocol; public uint cbPciLength; }
  [DllImport("winscard.dll")] public static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr context);
  [DllImport("winscard.dll", CharSet=CharSet.Unicode)] public static extern int SCardListReaders(IntPtr context, string groups, char[] readers, ref uint length);
  [DllImport("winscard.dll", CharSet=CharSet.Unicode)] public static extern int SCardConnect(IntPtr context, string reader, uint share, uint protocols, out IntPtr card, out uint activeProtocol);
  [DllImport("winscard.dll")] public static extern int SCardDisconnect(IntPtr card, uint disposition);
  [DllImport("winscard.dll")] public static extern int SCardReleaseContext(IntPtr context);
  [DllImport("winscard.dll")] public static extern int SCardTransmit(IntPtr card, ref SCARD_IO_REQUEST sendPci, byte[] sendBuffer, uint sendLength, IntPtr recvPci, byte[] recvBuffer, ref uint recvLength);
}
"@

function Get-ReaderNames([IntPtr]$Context) {
  [uint32]$length = 0
  $rc = [PcscNative]::SCardListReaders($Context, $null, $null, [ref]$length)
  if ($rc -ne 0 -or $length -eq 0) { return @() }
  $chars = New-Object char[] $length
  $rc = [PcscNative]::SCardListReaders($Context, $null, $chars, [ref]$length)
  if ($rc -ne 0) { return @() }
  return (-join $chars).Trim([char]0).Split([char]0) | Where-Object { $_ }
}

function Open-Card {
  [IntPtr]$ctx = [IntPtr]::Zero
  $rc = [PcscNative]::SCardEstablishContext([PcscNative]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$ctx)
  if ($rc -ne 0) { throw "PC/SC context error: 0x$('{0:X8}' -f ($rc -band 0xffffffff))" }
  $readers = @(Get-ReaderNames $ctx)
  if ($readers.Count -eq 0) { [PcscNative]::SCardReleaseContext($ctx) | Out-Null; throw 'No smart-card reader found.' }
  $reader = ($readers | Where-Object { $_ -match 'ACR122' } | Select-Object -First 1)
  if (-not $reader) { $reader = $readers[0] }
  [IntPtr]$card = [IntPtr]::Zero; [uint32]$protocol = 0
  $rc = [PcscNative]::SCardConnect($ctx, $reader, [PcscNative]::SCARD_SHARE_SHARED, ([PcscNative]::SCARD_PROTOCOL_T0 -bor [PcscNative]::SCARD_PROTOCOL_T1), [ref]$card, [ref]$protocol)
  if ($rc -ne 0) { [PcscNative]::SCardReleaseContext($ctx) | Out-Null; throw "No NFC card detected." }
  return @{ Context=$ctx; Card=$card; Protocol=$protocol; Reader=$reader }
}

function Close-Card($session) {
  if ($session.Card -ne [IntPtr]::Zero) { [PcscNative]::SCardDisconnect($session.Card, [PcscNative]::SCARD_LEAVE_CARD) | Out-Null }
  if ($session.Context -ne [IntPtr]::Zero) { [PcscNative]::SCardReleaseContext($session.Context) | Out-Null }
}

function Transmit($session, [byte[]]$apdu) {
  $pci = New-Object PcscNative+SCARD_IO_REQUEST
  $pci.dwProtocol = [uint32]$session.Protocol; $pci.cbPciLength = [uint32][Runtime.InteropServices.Marshal]::SizeOf($pci)
  [byte[]]$recv = New-Object byte[] 258; [uint32]$recvLen = $recv.Length
  $rc = [PcscNative]::SCardTransmit($session.Card, [ref]$pci, $apdu, [uint32]$apdu.Length, [IntPtr]::Zero, $recv, [ref]$recvLen)
  if ($rc -ne 0) { throw "Card communication error: 0x$('{0:X8}' -f ($rc -band 0xffffffff))" }
  $result = $recv[0..($recvLen-1)]
  if ($recvLen -lt 2 -or $result[$recvLen-2] -ne 0x90 -or $result[$recvLen-1] -ne 0x00) { throw "Card rejected command: $(([BitConverter]::ToString($result)))" }
  if ($recvLen -eq 2) { return [byte[]]@() }
  return [byte[]]$result[0..($recvLen-3)]
}

function Get-Uid($session) {
  $bytes = Transmit $session ([byte[]](0xFF,0xCA,0x00,0x00,0x00))
  return (($bytes | ForEach-Object { $_.ToString('X2') }) -join ':')
}

function Read-Pages($session, [int]$startPage, [int]$byteCount) {
  $all = New-Object System.Collections.Generic.List[byte]
  $page = $startPage
  while ($all.Count -lt $byteCount) {
    $chunk = Transmit $session ([byte[]](0xFF,0xB0,0x00,[byte]$page,0x10))
    foreach ($b in $chunk) { $all.Add($b) }
    $page += 4
  }
  return [byte[]]$all.ToArray()[0..($byteCount-1)]
}

function Write-Page($session, [int]$page, [byte[]]$fourBytes) {
  if ($fourBytes.Length -ne 4) { throw 'Internal page size error.' }
  $apdu = [byte[]](0xFF,0xD6,0x00,[byte]$page,0x04) + $fourBytes
  [void](Transmit $session $apdu)
  Start-Sleep -Milliseconds 8
}

function Get-UriPrefix([string]$url) {
  $prefixes = @(
    @{Text='http://www.'; Code=1}, @{Text='https://www.'; Code=2}, @{Text='http://'; Code=3}, @{Text='https://'; Code=4}
  )
  foreach ($p in $prefixes) { if ($url.StartsWith($p.Text,[StringComparison]::OrdinalIgnoreCase)) { return $p } }
  return @{Text=''; Code=0}
}

function Build-NdefUri([string]$url) {
  $p = Get-UriPrefix $url
  $rest = $url.Substring($p.Text.Length)
  [byte[]]$uriBytes = [Text.Encoding]::UTF8.GetBytes($rest)
  $payloadLen = 1 + $uriBytes.Length
  if ($payloadLen -gt 255) { throw 'URL is too long for this writer.' }
  [byte[]]$record = [byte[]](0xD1,0x01,[byte]$payloadLen,0x55,[byte]$p.Code) + $uriBytes
  if ($record.Length -gt 254) { throw 'NDEF message is too long.' }
  return [byte[]](0x03,[byte]$record.Length) + $record + [byte[]](0xFE)
}

function Write-NdefUri($session, [string]$url) {
  [byte[]]$data = Build-NdefUri $url
  $capacity = 504 # safe for NTAG215/216; writing only required pages
  if ($data.Length -gt $capacity) { throw 'URL does not fit on the NFC card.' }
  $paddedLen = [Math]::Ceiling($data.Length / 4.0) * 4
  [byte[]]$padded = New-Object byte[] $paddedLen
  [Array]::Copy($data, $padded, $data.Length)
  # Write an empty TLV length first, then content, then final first page.
  Write-Page $session 4 ([byte[]](0x03,0x00,0xFE,0x00))
  for ($i=4; $i -lt $padded.Length; $i+=4) { Write-Page $session (4 + ($i/4)) ([byte[]]$padded[$i..($i+3)]) }
  Write-Page $session 4 ([byte[]]$padded[0..3])
}

function Parse-NdefUri([byte[]]$bytes) {
  $i=0
  while ($i -lt $bytes.Length) {
    $t=$bytes[$i]; $i++
    if ($t -eq 0x00) { continue }
    if ($t -eq 0xFE) { break }
    if ($i -ge $bytes.Length) { break }
    $len=$bytes[$i]; $i++
    if ($t -ne 0x03) { $i += $len; continue }
    if ($i + $len -gt $bytes.Length) { break }
    [byte[]]$m=$bytes[$i..($i+$len-1)]
    if ($m.Length -lt 5) { return $null }
    $typeLen=$m[1]; $payloadLen=$m[2]
    $payloadStart=3+$typeLen
    if ($m[3] -ne 0x55 -or $payloadStart -ge $m.Length) { return $null }
    $code=$m[$payloadStart]
    $prefix=@{0='';1='http://www.';2='https://www.';3='http://';4='https://'}[$code]
    if ($null -eq $prefix) { $prefix='' }
    $textLen=$payloadLen-1
    if ($textLen -lt 0) { return $null }
    $text = if ($textLen -eq 0) { '' } else { [Text.Encoding]::UTF8.GetString($m, $payloadStart+1, $textLen) }
    return $prefix + $text
  }
  return $null
}

function Get-Status {
  [IntPtr]$ctx=[IntPtr]::Zero
  $rc=[PcscNative]::SCardEstablishContext([PcscNative]::SCARD_SCOPE_USER,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$ctx)
  if($rc-ne 0){ return @{ok=$false;reader=$null;cardPresent=$false;uid=$null;error='PC/SC unavailable'} }
  try {
    $readers=@(Get-ReaderNames $ctx); if($readers.Count-eq 0){ return @{ok=$true;reader=$null;cardPresent=$false;uid=$null} }
    $reader=($readers|Where-Object{$_-match'ACR122'}|Select-Object -First 1); if(-not $reader){$reader=$readers[0]}
    try { $s=Open-Card; try { $uid=Get-Uid $s; return @{ok=$true;reader=$reader;cardPresent=$true;uid=$uid} } finally { Close-Card $s } }
    catch { return @{ok=$true;reader=$reader;cardPresent=$false;uid=$null} }
  } finally { [PcscNative]::SCardReleaseContext($ctx)|Out-Null }
}

function Add-BridgeHeaders($context) {
  # Allow the installed PWA / GitHub Pages app to call this loopback-only bridge.
  # New Chromium versions require explicit Local/Private Network permission headers.
  $origin = [string]$context.Request.Headers['Origin']
  if ([string]::IsNullOrWhiteSpace($origin)) { $origin = '*' }
  $context.Response.Headers.Set('Access-Control-Allow-Origin', $origin)
  $context.Response.Headers.Set('Vary', 'Origin')
  $context.Response.Headers.Set('Access-Control-Allow-Headers', 'Content-Type')
  $context.Response.Headers.Set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  $context.Response.Headers.Set('Access-Control-Allow-Private-Network', 'true')
  $context.Response.Headers.Set('Access-Control-Max-Age', '600')
  $context.Response.Headers.Set('Cache-Control', 'no-store')
}


function Send-Html($context, [int]$status, [string]$html) {
  $bytes=[Text.Encoding]::UTF8.GetBytes($html)
  $context.Response.StatusCode=$status
  $context.Response.ContentType='text/html; charset=utf-8'
  $context.Response.Headers.Set('Cache-Control','no-store')
  $context.Response.ContentLength64=$bytes.Length
  $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $context.Response.OutputStream.Close()
}

function Normalize-Url([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  # Verification only: compare the effective web address, not the NDEF URI prefix
  # compression. Writing logic is intentionally unchanged.
  $normalized = $value.Trim().ToLowerInvariant()
  $normalized = $normalized -replace '^https?://', ''
  $normalized = $normalized -replace '^www\.', ''
  $normalized = $normalized.TrimEnd('/')
  return $normalized
}

function Get-LocalStudioHtml {
@'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tabaja Local NFC Writer</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f4f6fa;color:#14213d}.wrap{max-width:760px;margin:32px auto;padding:20px}.card{background:white;border-radius:18px;padding:22px;box-shadow:0 12px 35px rgba(25,42,70,.10);margin-bottom:16px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.status{font-weight:800;padding:10px 14px;border-radius:999px;display:inline-block;background:#fff3cd}.ok{background:#def7e7;color:#12643a}.bad{background:#fde3e3;color:#8a1c1c}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #cfd7e6;border-radius:10px;font-size:16px}button{width:100%;padding:13px;border:0;border-radius:10px;font-weight:800;cursor:pointer;background:#173b7a;color:#fff}button.secondary{background:#e9edf5;color:#173b7a}button:disabled{opacity:.45;cursor:not-allowed}.small{color:#667085;font-size:13px}.log{min-height:56px;padding:12px;border-radius:10px;background:#f7f9fc;white-space:pre-wrap}.auto{display:flex;gap:9px;align-items:center;margin:12px 0}.auto input{width:auto}@media(max-width:650px){.row{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<div class="card"><h1>Tabaja Local NFC Writer</h1><p class="small">This page runs directly from the bridge, so Edge cannot block the reader connection.</p><div id="status" class="status">Checking bridge…</div><p id="reader" class="small"></p><p id="card"></p><p id="uid" class="small"></p></div>
<div class="card"><label><b>Website link</b></label><input id="url" value="https://www.dtasl.co"><label class="auto"><input id="auto" type="checkbox"> Auto-write the same link when the next card is placed</label><div class="row"><button id="read" class="secondary">Read NFC Card</button><button id="write">Write Website Link</button></div><div style="margin-top:12px"><button id="verify" class="secondary">Verify Written Card</button></div></div>
<div class="card"><b>Activity</b><div id="log" class="log">Ready.</div></div>
</div><script>
const $=id=>document.getElementById(id);let present=false,previous=false,busy=false,armed=true;
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})},cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||'Bridge error');return d}
function buttons(){const e=present&&!busy;$('read').disabled=!e;$('write').disabled=!e;$('verify').disabled=!e}
function log(t,ok=true){$('log').textContent=(ok?'✓ ':'! ')+t+' — '+new Date().toLocaleTimeString()}
function sendParent(message,target='*'){if(window.opener&&!window.opener.closed)window.opener.postMessage({channel:'tabaja-nfc-bridge',...message},target)}
async function status(push=true){try{const d=await api('/status');present=!!d.cardPresent;$('status').textContent=present?'CARD READY':'READER READY';$('status').className='status ok';$('reader').textContent='Reader: '+(d.reader||'Not connected');$('card').textContent=present?'Card detected':'Place one card in the center';$('uid').textContent=d.uid?'UID: '+d.uid:'';if(push)sendParent({type:'status',data:d});if($('auto').checked){if(!present)armed=true;if(present&&!previous&&armed&&!busy){armed=false;setTimeout(write,180)}}previous=present;return d}catch(e){present=false;$('status').textContent='BRIDGE ERROR';$('status').className='status bad';$('reader').textContent=e.message;throw e}finally{buttons()}}
async function run(fn){if(busy)return;busy=true;buttons();try{return await fn()}catch(e){log(e.message,false);throw e}finally{busy=false;buttons();status().catch(()=>{})}}
async function read(){return run(async()=>{const d=await api('/read');if(d.url)$('url').value=d.url;log(d.url?'Read: '+d.url:'Card UID: '+d.uid);return d})}
async function write(customUrl){const u=(customUrl||$('url').value).trim();if(!/^https?:\/\//i.test(u)){const e=new Error('Link must start with https:// or http://');log(e.message,false);throw e}$('url').value=u;return run(async()=>{const d=await api('/write',{method:'POST',body:JSON.stringify({url:u})});log('Written and verified: '+d.url);return d})}
async function verify(customUrl){const u=(customUrl||$('url').value).trim();return run(async()=>{const d=await api('/verify',{method:'POST',body:JSON.stringify({url:u})});log(d.match?'Verified: '+d.url:'Mismatch. Found: '+(d.url||'no URL'),d.match);return d})}
$('read').onclick=()=>read().catch(()=>{});$('write').onclick=()=>write().catch(()=>{});$('verify').onclick=()=>verify().catch(()=>{});$('auto').onchange=()=>armed=true;
window.addEventListener('message',async event=>{const m=event.data;if(event.source!==window.opener||!m||m.channel!=='tabaja-nfc-command')return;try{let data;if(m.action==='status')data=await status(false);else if(m.action==='read')data=await read();else if(m.action==='write')data=await write(m.payload&&m.payload.url);else if(m.action==='verify')data=await verify(m.payload&&m.payload.url);else throw new Error('Unknown NFC command');event.source.postMessage({channel:'tabaja-nfc-bridge',type:'response',id:m.id,ok:true,data},event.origin)}catch(e){event.source.postMessage({channel:'tabaja-nfc-bridge',type:'response',id:m.id,ok:false,error:e.message||String(e)},event.origin)}});
sendParent({type:'ready'});status().catch(()=>{});setInterval(()=>status().catch(()=>{}),700);
</script></body></html>
'@
}


function Get-MimeType([string]$path) {
  switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.css' { 'text/css; charset=utf-8' }
    '.js' { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.webmanifest' { 'application/manifest+json; charset=utf-8' }
    '.png' { 'image/png' }
    '.jpg' { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.gif' { 'image/gif' }
    '.svg' { 'image/svg+xml' }
    '.ico' { 'image/x-icon' }
    '.txt' { 'text/plain; charset=utf-8' }
    default { 'application/octet-stream' }
  }
}

function Send-StaticFile($context, [string]$requestPath) {
  $relative = [Uri]::UnescapeDataString($requestPath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
  $relative = $relative -replace '/', [IO.Path]::DirectorySeparatorChar
  $fullPath = [IO.Path]::GetFullPath((Join-Path $ProjectRoot $relative))
  if (-not $fullPath.StartsWith($ProjectRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Send-Json $context 403 @{ok=$false;error='Forbidden'}
    return
  }
  if ([IO.Directory]::Exists($fullPath)) { $fullPath = Join-Path $fullPath 'index.html' }
  if (-not [IO.File]::Exists($fullPath)) {
    Send-Json $context 404 @{ok=$false;error='File not found'}
    return
  }
  [byte[]]$bytes = [IO.File]::ReadAllBytes($fullPath)
  $context.Response.StatusCode = 200
  $context.Response.ContentType = Get-MimeType $fullPath
  $context.Response.Headers.Set('Cache-Control','no-store, no-cache, must-revalidate')
  $context.Response.Headers.Set('Pragma','no-cache')
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $context.Response.OutputStream.Close()
}

function Send-Json($context, [int]$status, $obj) {
  $json=$obj|ConvertTo-Json -Compress -Depth 5
  $bytes=[Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode=$status
  $context.Response.ContentType='application/json; charset=utf-8'
  Add-BridgeHeaders $context
  $context.Response.ContentLength64=$bytes.Length
  $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $context.Response.OutputStream.Close()
}

$listener=New-Object Net.HttpListener
$listener.Prefixes.Add('http://+:8766/')
$listener.Start()
Write-Host 'Tabaja NFC Bridge is running.' -ForegroundColor Green
Write-Host 'Reader: ACR122U via Windows PC/SC' -ForegroundColor Cyan
Write-Host 'Keep this window open while using NFC.'
Write-Host 'PC app: http://127.0.0.1:8766/' -ForegroundColor Yellow
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)
if ($lanIp) { Write-Host ("Samsung / LAN: http://{0}:8766/" -f $lanIp) -ForegroundColor Magenta }
Start-Sleep -Milliseconds 300
try { Start-Process 'http://127.0.0.1:8766/?nfc-local=1' } catch {}

while($listener.IsListening){
  $ctx=$listener.GetContext()
  try {
    if($ctx.Request.HttpMethod-eq'OPTIONS'){
      Add-BridgeHeaders $ctx
      $ctx.Response.StatusCode=204
      $ctx.Response.ContentLength64=0
      $ctx.Response.OutputStream.Close()
      continue
    }
    $path=$ctx.Request.Url.AbsolutePath
    $body=@{}
    if($ctx.Request.HasEntityBody){ $reader=New-Object IO.StreamReader($ctx.Request.InputStream,$ctx.Request.ContentEncoding); $raw=$reader.ReadToEnd(); if($raw){$body=$raw|ConvertFrom-Json} }
    switch($path){
      '/studio' { Send-Html $ctx 200 (Get-LocalStudioHtml) }
      '/status' { Send-Json $ctx 200 (Get-Status) }
      '/read' {
        $s=Open-Card; try { $uid=Get-Uid $s; $raw=Read-Pages $s 4 256; $url=Parse-NdefUri $raw; Send-Json $ctx 200 @{ok=$true;uid=$uid;url=$url} } finally { Close-Card $s }
      }
      '/write' {
        $url=[string]$body.url; if($url-notmatch'^https?://'){throw'Link must start with https:// or http://'}
        $s=Open-Card; try { $uid=Get-Uid $s; Write-NdefUri $s $url; $verify=Parse-NdefUri (Read-Pages $s 4 256); if((Normalize-Url $verify) -ne (Normalize-Url $url)){ throw "Write verification failed. Read back: $verify" }; Send-Json $ctx 200 @{ok=$true;uid=$uid;url=$verify} } finally { Close-Card $s }
      }
      '/verify' {
        $expected=[string]$body.url; $s=Open-Card; try { $uid=Get-Uid $s; $url=Parse-NdefUri (Read-Pages $s 4 256); Send-Json $ctx 200 @{ok=$true;uid=$uid;url=$url;match=((Normalize-Url $url) -eq (Normalize-Url $expected))} } finally { Close-Card $s }
      }
      default { Send-StaticFile $ctx $path }
    }
  } catch { try { Send-Json $ctx 500 @{ok=$false;error=$_.Exception.Message} } catch {} }
}
