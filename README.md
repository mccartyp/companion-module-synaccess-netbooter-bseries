# Synaccess netBooter B Series – Bitfocus Companion Module

This Bitfocus Companion module provides control of **Synaccess netBooter B Series PDUs**
using the legacy **HTTP GET `cmd.cgi` interface** with **Basic Authentication**.

It supports outlet control, reboot actions, live status polling, feedbacks, and variables
for supported B Series devices.

---

## Supported Devices (B Series)

This module supports the following **Synaccess B Series PDU models**, which all use the
`/cmd.cgi` HTTP API:

### 2-Outlet Models
- NP-02B-USB
- NP-02B-DB9
- NP-02BH-USB
- NP-02BH-DB9

### 5-Outlet Models
- NP-05B-USB
- NP-05B-DB9
- NP-05BH-USB
- NP-05BH-DB9

The module automatically detects whether the connected device has **2 or 5 outlets**
by parsing the `$A5` status response.

---

## Not Supported

- **Newer Synaccess PDUs using RESTful APIs**
- Non-B-Series devices

A separate Companion module is necessary for REST-based Synaccess devices.

---

## Quick Start

1. Add the module in Bitfocus Companion.
2. Configure:
   - **Host / IP** – IP address of the netBooter device
   - **Username / Password** – HTTP Basic Auth credentials
3. Apply the configuration.
4. Use **Refresh Status Now** or observe the **Connected** feedback to confirm communication.

Once connected, outlet actions and feedbacks will reflect the current device state.

---

## Actions

| Action | Description |
|------|------------|
| Set Outlet ON/OFF | Explicitly turn a single outlet ON or OFF |
| Toggle Outlet | Toggle a single outlet |
| Reboot Outlet | Power-cycle a single outlet |
| Set All Outlets ON/OFF | Control all outlets at once |
| Refresh Status Now | Immediately poll the device status |

---

## Feedbacks

| Feedback | Description |
|--------|------------|
| Outlet is ON | True when the selected outlet is currently ON |
| Connected | True when the last status poll succeeded |

---

## Variables

| Variable | Description |
|---------|------------|
| `port_count` | Number of detected outlets (2 or 5) |
| `outlet_1` … `outlet_n` | Outlet state (`true` = ON, `false` = OFF) |
| `outlets_bits` | Outlet states as a bit string in outlet order |
| `current_amps` | Current draw (amps), if provided by device |
| `temp_c` | Temperature (°C), if provided by device |

---

## Communication Protocol

- HTTP GET requests to `/cmd.cgi`
- HTTP Basic Authentication
- Commands use the `$A*` syntax defined by Synaccess
- Commands are sent with **spaces converted to `+`**
  (no percent-encoding, to maintain compatibility with embedded firmware)
- Uses a **single keep-alive HTTP agent** to minimize socket churn on the embedded
  target while still serializing commands for stability.

### Example Request

```text
GET http://192.168.1.100/cmd.cgi?$A3+1+1
Authorization: Basic <base64 username:password>
```

### Return Codes

- `$A0` – OK (executed successfully)
- `$AF` – Error / unknown command

---

## Status Parsing and Outlet Mapping

The `$A5` status command returns outlet state bits in one of the following forms:

```text
xxxx,cccc,cccc,tt
```

or

```text
xxxx,cccc,tt
```

Where:

- Each `x` is an outlet state (`1` = ON, `0` = OFF)
- **The right-most bit represents outlet 1**

This module normalizes the returned data so:

- `outlet_1` always maps to physical outlet 1
- Outlet numbering in Companion matches the device labeling

---

## Companion Best Practices

This module follows Bitfocus development best practices:

- **Connection management** – Validates configuration before starting polls, and
  resets the HTTP agent after network/socket failures to recover from link drops.
- **Efficient communication** – Serializes commands through a keep-alive agent
  to avoid overloading the embedded stack.
- **Robust error handling** – Normalizes common connection errors (timeouts,
  host not found, refused connections) into clear Companion status messages.
- **Batch variable updates** – Pushes all variables in a single update to keep
  feedbacks and bindings in sync without unnecessary churn.
- **User experience** – Includes connection/telemetry presets (connection status,
  outlet bits, power/temp) in addition to per-outlet power controls for quick
  dashboarding.

---

## Polling Behavior

- The module polls `$A5` at the configured interval (default: 2000 ms)
- Actions trigger an immediate status refresh after execution
- Poll requests are serialized to avoid overlapping calls on slow devices

---

## Troubleshooting

### Connection Failure
- Verify the device IP address and network reachability
- Confirm HTTP Basic Auth credentials
- Ensure the device is on a trusted management network or VLAN

### Outlet Count Detection Issues
Manually test the device response:

```bash
curl -u admin:admin "http://<device-ip>/cmd.cgi?\$A5"
```

Confirm the response includes **2 or 5 outlet bits**.

### Outlet Appears Inverted
- Confirm the physical outlet numbering matches the device labeling
- Remember that `$A5` reports outlet 1 as the **right-most bit**

---

## Security Notes

- B Series devices use HTTP (not HTTPS) for the `cmd.cgi` API
- Credentials are stored in the Companion module configuration (standard Companion behavior)
- It is recommended to place the device on a trusted management network

---

## Development Status

- Initial implementation
- Tested against Synaccess netBooter NP-05B hardware

---

## License

MIT
