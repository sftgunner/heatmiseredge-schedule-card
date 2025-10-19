# Heatmiser Thermostat Schedule Card

A custom card for Home Assistant that provides a visual interface for viewing and editing Heatmiser Edge thermostat schedules.

## Features

- Visual timeline display of heating schedules
- Support for different schedule modes (24 Hour, Weekday/Weekend, 7 Day)
- Color-coded temperature segments
- Click-to-edit functionality
- Real-time schedule updates
- Temperature range: 5-35°C
- Up to 4 time periods per day
- Apply changes to single days, weekdays/weekends, or all days

## Installation

1. Download the `heatmiseredge-schedule-card.js` file
2. Copy it to your `config/www` folder
3. Add the following to your dashboard resources:

```yaml
resources:
  - url: /local/heatmiseredge-schedule-card.js
    type: module
```

## Usage

Add the card to your dashboard through the UI:

1. Click "Add Card"
2. Choose "Custom: Heatmiser Thermostat Card"
3. Select your Heatmiser Edge device from the dropdown

Or add it manually in YAML:

```yaml
type: custom:heatmiseredge-schedule-card
device: YOUR_DEVICE_ID
```

## Interface

### Schedule Display
- Each day shows a timeline from 00:00 to 24:00
- Different colors represent different temperatures:
  - Blue (<15°C)
  - Light Blue (15-18°C)
  - Yellow (19-22°C)
  - Red (≥23°C)
- Tick marks show 15-minute intervals
- Major tick marks show 3-hour intervals

### Editing
1. Click "Edit" or anywhere on a day's row to open the editor
2. Set up to 4 time periods with:
   - Start time (HH:MM)
   - Temperature (5-35°C)
3. Choose how to apply changes:
   - "Apply" - Updates just this day
   - "Apply weekdays/weekends" - Updates all weekdays or weekend days
   - "Apply all" - Updates the entire week

### Schedule Modes
The card automatically adapts to your thermostat's schedule mode:
- **24 Hour**: Shows one day that applies to all days
- **Weekday/Weekend**: Shows two schedules (weekday and weekend)
- **7 Day**: Shows individual schedules for each day

## Technical Details

- Updates happen in real-time when changes are made
- Schedule data is stored in Modbus registers (50-217)
- Each time period uses 4 registers:
  - Hour (0-24)
  - Minute (0-59)
  - Temperature (50-350, representing 5.0-35.0°C)
  - Reserved (always 0)
- Periods 5-6 are reserved and set to defaults (24:00, 16°C)

## Troubleshooting

- If the schedule doesn't update, click the refresh button
- Changes may take a few seconds to apply
- Check the browser console for error messages
- Verify your device has proper Modbus connectivity

## Dependencies

- Requires the Heatmiser Edge integration
- Works with Heatmiser Edge thermostats

## Developer Documentation

### Core Components

#### Card Initialization
- `constructor()`: Initializes default schedule data structure and state tracking
- `setConfig(config)`: Validates device configuration
- `set hass(hass)`: Entry point for Home Assistant state updates

#### Schedule Data Management
- `thermostatSchedule`: Core data structure storing schedule information per day
- `thermostatScheduleRegister`: Raw register values (168 values total: 7 days × 6 periods × 4 values)
- `dayRegisterStartingByte`: Maps days to their starting register addresses [74, 98, 122, 146, 170, 194, 50]

#### Device Communication
- `readScheduleFromDevice()`: Reads schedule from device entities
  - Converts entity states to schedule format
  - Updates both `thermostatSchedule` and `thermostatScheduleRegister`
- `writeRegisters(registerStart, values, isLastWrite)`: Writes to device registers
  - Handles single/multiple period writes
  - Controls refresh timing via `isLastWrite` parameter

#### UI Rendering
- `render()`: Builds initial card HTML structure
- `renderAll()`: Renders all day schedules
- `renderDay(day)`: Renders single day's schedule
  - Creates timeline segments
  - Handles temperature color coding
  - Builds time ticker marks
- `updateScheduleDisplay()`: Updates UI when schedule changes
  - Uses `_lastRenderedSchedule` to prevent unnecessary updates
  - Updates segments in place when possible

#### Schedule Editing
- `applySchedule(day, type)`: Handles schedule updates
  - Types: 'single', 'group', 'all'
  - Converts UI values to register format
  - Manages register writes sequence
- `getRegisterValuesFromInputs(day)`: Converts UI inputs to register values
- `convertScheduleToRegister()`: Converts schedule to raw register format

#### Helper Functions
- `findClimateEntityFromDevice(deviceId)`: Maps device ID to climate entity
- `getScheduleMode()`: Determines current schedule mode (24 Hour/Weekday/Weekend/7 Day)
- `getColorForTemperature(temp)`: Maps temperatures to colors
- `parseTimeToMinutes(time)`: Converts HH:MM to minutes
- `prefillEditor(day)`: Populates editor with current values

### Register Format
Each time period uses 4 consecutive registers:
1. Hour (0-24)
2. Minute (0-59)
3. Temperature (50-350, representing 5.0-35.0°C)
4. Reserved (always 0)

### Day Register Map
- Sunday: 50-73 (24 registers)
- Monday: 74-97
- Tuesday: 98-121
- Wednesday: 122-145
- Thursday: 146-169
- Friday: 170-193
- Saturday: 194-217

### Event Flow
1. User action triggers schedule change
2. UI inputs converted to register format
3. Register values written to device
4. Device updates entity states
5. Home Assistant pushes state update
6. Card receives update via `hass` setter
7. Schedule display refreshes with new values

### Performance Optimizations
- Schedule change tracking via `_lastRenderedSchedule`
- DOM updates only for changed segments
- Register writes batched where possible
- Editor state maintained during updates