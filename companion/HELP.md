# Synaccess netBooter B Series

Controls Synaccess **netBooter B Series** PDUs using the legacy HTTP GET `cmd.cgi` interface with HTTP Basic Authentication.

## Supported devices
This module is intended for Synaccess **B Series PDU** models including:
- NP-02B-USB, NP-02B-DB9, NP-02BH-USB, NP-02BH-DB9 (2 outlets)
- NP-05B-USB, NP-05B-DB9, NP-05BH-USB, NP-05BH-DB9 (5 outlets)

The module auto-detects **2 vs 5 outlets** using the `$A5` status response.

## Configuration
- **Host / IP**: Device address (e.g. `192.168.1.100`)
- **Username / Password**: HTTP Basic Auth credentials
- **Poll Interval**: How often the module requests `$A5` to update state (ms)
- **Status Timeout**: Timeout for `$A5` polls (ms)
- **Control Timeout**: Timeout for `$A3/$A7` outlet commands (ms)
- **Reboot Timeout**: Timeout applied to each OFF/ON leg of reboot (ms)
- **Control Pacing**: Delay inserted between back-to-back control calls (ms)

## Notes on protocol encoding
Commands are sent to `/cmd.cgi` using the `$A*` syntax.  
For compatibility with embedded firmware, commands are formatted with **spaces converted to `+`** (no percent-encoding).

Example:
- `$A3 1 1` is sent as `.../cmd.cgi?$A3+1+1`

## Actions
- Set Outlet ON/OFF
- Toggle Outlet
- Reboot Outlet
- Set All Outlets ON/OFF
- Refresh Status Now

## Feedbacks
- Outlet is ON
- Connected

## Variables
- `port_count` (2 or 5)
- `outlet_1` … `outlet_n` (boolean, true when ON)
- `outlets_bits` (string of bits in outlet order)
- `current_amps` (if provided by device)
- `temp_c` (if provided by device)
- `last_error` (empty when OK)

## Return codes
- `$A0` – OK
- `$AF` – Action failed / unknown command
