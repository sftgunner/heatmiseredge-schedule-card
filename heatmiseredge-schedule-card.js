// Heatmiser Thermostat Custom Card (Plain JS for type: js)

class HeatmiserEdgeScheduleCard extends HTMLElement {
  constructor() {
    super();
    this.thermostatSchedule = {
      monday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ],
      tuesday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ],
      wednesday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ],
      thursday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ],
      friday: [
        { time: '05:00', temp: 14 },
        { time: '08:30', temp: 21 },
        { time: '19:30', temp: 19 },
        { time: '21:30', temp: 16 }
      ],
      saturday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ],
      sunday: [
        { time: '05:00', temp: 0 },
        { time: '08:30', temp: 0 },
        { time: '19:30', temp: 0 },
        { time: '21:30', temp: 0 }
      ]
    };
    // Default period values (24:00, 0min, 16degC, 0)
    this.defaultPeriodValues = [24, 0, 160, 0];
    
    // Initialize thermostatScheduleRegister with default values
    this.thermostatScheduleRegister = new Array(7 * 6 * 4).fill(0);
    this.dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    this.dayRegisterStartingByte = [74, 98, 122, 146, 170, 194, 50]; // Starting byte for each day in the register map
    this.entity = null;
    
    // Track last rendered schedule per day to avoid unnecessary DOM updates
    this._lastRenderedSchedule = {};
    this.dayOrder.forEach(d => {
      this._lastRenderedSchedule[d] = JSON.stringify(this.thermostatSchedule[d] || []);
    });
  }
  
  set hass(hass) {
    console.log("Hass object updated at time "+new Date().toLocaleTimeString());
    this._hass = hass; // Store the hass object for later use
    if (!this.content) {
      this.innerHTML = `
        <ha-card header="Heatmiser schedule">
          <div class="card-content">Loading content...</div>
        </ha-card>
        `;
      this.content = this.querySelector(".card-content");
      this.updateContent(this.content,true);
      console.log("Completed initial load")
    }
    else{
      console.log("Starting data refresh at time "+new Date().toLocaleTimeString());
      this.updateContent(this.content,false);
    }
  }
  
  static getConfigForm() {
    return {
      schema: [
        { 
          name: "device", 
          required: true, 
          selector: { 
            device: { 
              integration: "heatmiser_edge",
              entity: {
                domain: "climate"
              }
            } 
          } 
        }
      ],
      computeHelper: (schema) => {
        switch (schema.name) {
          case "device":
          return "Select a Heatmiser Edge thermostat device";
        }
        return undefined;
      },
      assertConfig: (config) => {
        if (config.other_option) {
          throw new Error("'other_option' is unexpected.");
        }
      },
    };
  }
  
  getGridOptions() {
    return {
      rows: 20,
      columns: 24,
      min_rows: 20,
    };
  }
  
  updateNumberValue(entity,value){
    if (!this._hass) return;
    console.log(`Updating ${entity} to ${value}`);
    this._hass.callService('number', 'set_value', {
      entity_id: entity,
      value: value
    });
  }
  
  updateTimeValue(entity, value) {
    if (!this._hass) return;
    console.log(`Updating ${entity} to ${value}`);
    if (value.length === 5) {
      value += ':00';
    }
    this._hass.callService('time', 'set_value', {
      entity_id: entity,
      time: value
    });
  }
  
  convertScheduleToRegister() {
    // Day order for register format (Sunday first)
    const registerDayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    registerDayOrder.forEach((day, dayIndex) => {
      const daySchedule = this.thermostatSchedule[day] || [];
      const baseIndex = dayIndex * 24; // 24 values per day (6 periods × 4 values)
      
      // Process up to 6 periods
      for (let period = 0; period < 6; period++) {
        const startIdx = baseIndex + (period * 4);
        
        if (period < daySchedule.length) {
          // Valid schedule entry exists
          const slot = daySchedule[period];
          const [hours, minutes] = slot.time.split(':').map(Number);
          const tempValue = Math.round(slot.temp * 10); // Convert temperature to register format
          
          // Update register values for this period
          this.thermostatScheduleRegister[startIdx] = hours;
          this.thermostatScheduleRegister[startIdx + 1] = minutes;
          this.thermostatScheduleRegister[startIdx + 2] = tempValue;
          this.thermostatScheduleRegister[startIdx + 3] = 0; // Reserved value
        } else {
          // Use default values for unused periods
          this.thermostatScheduleRegister[startIdx] = this.defaultPeriodValues[0];     // Hour = 24
          this.thermostatScheduleRegister[startIdx + 1] = this.defaultPeriodValues[1]; // Minute = 0
          this.thermostatScheduleRegister[startIdx + 2] = this.defaultPeriodValues[2]; // Temp = 160 (16.0°C)
          this.thermostatScheduleRegister[startIdx + 3] = this.defaultPeriodValues[3]; // Reserved = 0
        }
      }
    });
    
    // console.log('Converted register values:', this.thermostatScheduleRegister);
    console.log(this.thermostatScheduleRegister);
    return this.thermostatScheduleRegister;
  }
  
  updateContent(content, firstRender) {
    const deviceId = this.config.device;
    const entityId = this.findClimateEntityFromDevice(deviceId);
    this.entity = entityId;
    
    if (!entityId) {
      content.innerHTML = `
        <ha-card header="Heatmiser schedule">
          <div class="card-content">
            No climate entity found for device ID: ${deviceId}
          </div>
        </ha-card>
      `;
      return;
    }
    
    var entityState = this._hass.states[entityId];
    var temp = entityState ? entityState.attributes.temperature : 'N/A';
    var state = entityState ? entityState.state : 'unavailable';
    
    var numberEntityId = entityId.replace('climate.','number.');
    numberEntityId = numberEntityId.replace('_thermostat','_1mon_period1_temp');
    
    this.readScheduleFromDevice();
    
    if (firstRender){
      this.render();
      this.renderAll();
    }
    else{
      this.updateScheduleDisplay();
    }
    
    content.querySelector('.entity-id').textContent = entityId;
    content.querySelector('.entity-state').textContent = `Current: ${temp}°C (${state})`;
    content.querySelector('.last-update').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    // content.querySelector('.entity-mode').textContent = `Current: ${temp}°C (${state})`;
    
    //    
  }
  
  readScheduleFromDevice() {
    const entityId = this.entity;
    if (!entityId || !this._hass) return;
    
    const baseTempEntityId = entityId.replace('climate.', 'number.').replace('_thermostat', '');
    const baseTimeEntityId = entityId.replace('climate.', 'time.').replace('_thermostat', '');
    const dayMap = {
      '1mon': 'monday',
      '2tue': 'tuesday',
      '3wed': 'wednesday',
      '4thu': 'thursday',
      '5fri': 'friday',
      '6sat': 'saturday',
      '7sun': 'sunday'
    };
    
    // Iterate through each day
    for (const [shortDay, fullDay] of Object.entries(dayMap)) {
      // Iterate through 4 periods per day
      for (let period = 1; period <= 4; period++) {
        // Construct entity IDs for temperature and time
        const tempEntityId = `${baseTempEntityId}_${shortDay}_period${period}_temp`;
        const timeEntityId = `${baseTimeEntityId}_${shortDay}_period${period}_starttime`;
        
        // Get states
        const tempState = this._hass.states[tempEntityId];
        const timeState = this._hass.states[timeEntityId];
        
        if (tempState && timeState) {
          // Convert time from minutes since midnight to HH:MM format
          const timeStateSplit = timeState.state.split(':');
          const hours = parseInt(timeStateSplit[0]);
          const minutes = parseInt(timeStateSplit[1]);
          const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          
          // Update the schedule
          if (this.thermostatSchedule[fullDay] && this.thermostatSchedule[fullDay][period - 1]) {
            this.thermostatSchedule[fullDay][period - 1] = {
              time: timeString,
              temp: parseFloat(tempState.state)
            };
          }
        }
      }
    }
    this.convertScheduleToRegister(); // Update register representation at the same time
    console.log(this.thermostatSchedule)
    
    // // Sort each day's schedule by time
    // for (const day of Object.values(dayMap)) {
    //   this.thermostatSchedule[day].sort((a, b) => 
      //     this.parseTimeToMinutes(a.time) - this.parseTimeToMinutes(b.time)
    //   );
    // }
  }
  
  render() {
    console.log("Starting render at time "+new Date().toLocaleTimeString());
    const style = `
      <style>
        .week-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial; padding: 12px; }
        .day-row { margin: 16px 0; }
        .day-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .day-label { font-size:18px; font-weight:bold; }
        .progress-container { display:flex; height:40px; background:#f0f0f0; border-radius:4px; overflow:hidden; }
        .segment { display:flex; align-items:center; justify-content:center; font-weight:bold; color:white; transition: background-color 0.3s; }
        .segment:not(:last-child) {
        border-right: 2px solid #ffffff;}
        .ticker { display:flex; margin-top:6px; align-items:flex-end; height:12px; }
        .tick { width: calc(100% / 96); border-left:1px solid #bbb; height:6px; }
        .tick.hour { height:10px; border-left-color:#888; }
        .tick.major { height:12px; border-left-width:2px; }
        .ticker-labels { position:relative; height:14px; margin-top:2px; font-size:10px; color:#666; }
        .tick-number { position:absolute; bottom:0; transform:translateX(-50%); line-height:1; }
        .day-editor { display:none; padding:8px 0 0 0; }
        .day-editor.visible { display:block; }
        .fields { display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:10px; }
        .slot-pair { display:grid; grid-template-columns:auto 1fr auto 1fr; gap:6px 10px; align-items:center; padding:8px; border:2px solid var(--primary-color); border-radius:8px; background-old:#fafafa; background: var(--secondary-color); }
        .slot-label { grid-column:1 / -1; margin-bottom:4px; color:#666; font-size:12px; }
        .day-editor input[type="time"], .day-editor input[type="number"] { padding:6px 8px; border-radius:4px; border:1px solid #ccc; font-size:14px; }
        .controls { display:flex; align-items:center; gap:6px; }
        .controls label { min-width:48px; }
        .btn-inc, .btn-dec { padding:6px 8px; border-radius:4px; border:1px solid #ccc; cursor:pointer; min-width:36px; }
        .btn-inc { background: #2e7d32; color:#fff; border-color:#2e7d32; }
        .btn-dec { background: #c62828; color:#fff; border-color:#c62828; }
        .actions { margin-top:8px; display:flex; gap:8px; }
        .actions button { padding:6px 10px; border-radius:4px; border:1px solid #ccc; cursor:pointer; }
        .actions button.apply { background:#1976d2; border-color:#1976d2; color:#fff; }
        .actions button.cancel { background-old:#eee; }
        .thermostat-header { margin-bottom: 16px; }
        .entity-info { color: #666; font-size: 14px; margin-top: 4px; }
        .entity-id { color: #1976d2; margin-bottom: 2px; }
        .entity-state { font-weight: 500; }
         /* Responsive: on small screens put start and temp on their own rows */
         @media (max-width: 480px) {
           .slot-pair { grid-template-columns: 1fr; gap:6px; }
           .controls { width:100%; justify-content:flex-start; }
         }
      </style>
    `;
    
    let htmlContent = `
      <div class="week-container">
        <div class="thermostat-header">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div class="entity-info">
              <div class="entity-id"></div>
              <div class="entity-state">Loading...</div>
              <div class="last-update">Last updated: Never</div>
    
            </div>
            <ha-button appearance="filled" size="medium" class="refresh-btn">
              <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24">
                <path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
              </svg>
            </ha-button>
          </div>
        </div>
    `;
    const scheduleMode = this.getScheduleMode();
    let visibleDays;
    if (scheduleMode === 'Weekday/Weekend') {
      visibleDays = ['monday', 'saturday'];
    } else {
      visibleDays = this.dayOrder;
    }
    
    visibleDays.forEach(day => {
      let displayName;
      if (scheduleMode === 'Weekday/Weekend') {
        if (day === 'monday') {
          displayName = 'Weekdays';
        } else {
          displayName = 'Weekends';
        }
      } else {
        displayName = day.charAt(0).toUpperCase() + day.slice(1);
      }
      
      htmlContent += `
        <div class="day-row" data-day="${day}">
          <div class="day-header">
            <div class="day-label">${displayName}</div>
            <ha-button class="edit-btn" data-edit="${day}" size="small">Edit</ha-button>
          </div>
          <div class="progress-container" id="${day}"></div>
          <div class="ticker" id="${day}-ticker"></div>
          <div class="ticker-labels" id="${day}-ticker-labels"></div>
          <div class="day-editor" id="${day}-editor">
            <div class="fields">
              ${[1,2,3,4].map(i => `
              <div class="slot-pair">
                <div class="slot-label">Slot ${i}</div>
                <div class="controls">
                  <label>Start</label>
                  <button class="btn-dec" id="${day}-time-${i}-dec">-</button>
                  <input type="time" id="${day}-time-${i}" step="300">
                  <button class="btn-inc" id="${day}-time-${i}-inc">+</button>
                </div>
                <div class="controls">
                  <label>Temp</label>
                  <button class="btn-dec" id="${day}-temp-${i}-dec">-</button>
                  <input type="number" id="${day}-temp-${i}" min="5" max="35" step="0.5">
                  <button class="btn-inc" id="${day}-temp-${i}-inc">+</button>
                </div>
              </div>`).join('')}
            </div>
            <div class="actions">
              ${scheduleMode === '24 Hour' ? `
                <button class="apply" id="${day}-apply-all">Apply all</button>
                <button class="cancel" id="${day}-cancel">Cancel</button>
              ` : scheduleMode === 'Weekday/Weekend' ? `
                <button class="apply" id="${day}-apply-group">Apply ${
      ['saturday', 'sunday'].includes(day) ? 'weekends' : 'weekdays'
    }</button>
                <button class="apply" id="${day}-apply-all">Apply all</button>
                <button class="cancel" id="${day}-cancel">Cancel</button>
              ` : `
                <button class="apply" id="${day}-apply">Apply</button>
                <button class="apply" id="${day}-apply-group">Apply ${
    ['saturday', 'sunday'].includes(day) ? 'weekends' : 'weekdays'
  }</button>
                <button class="apply" id="${day}-apply-all">Apply all</button>
                <button class="cancel" id="${day}-cancel">Cancel</button>
              `}
            </div>
          </div>
        </div>`;
});
htmlContent += `</div>`;
this.content.innerHTML = style + htmlContent;

this.attachEventHandlers();
}

attachEventHandlers() {
  console.log("Attaching event handlers");
  
  // Add refresh button handler
  const refreshBtn = this.querySelector('.refresh-btn');
  if(refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      this.readScheduleFromDevice();
      this.updateScheduleDisplay();
    });
  }
  
  const scheduleMode = this.getScheduleMode();
  let visibleDays;
  if (scheduleMode === 'Weekday/Weekend') {
    visibleDays = ['monday', 'saturday'];
  } else {
    visibleDays = this.dayOrder;
  }
  
  visibleDays.forEach(day => {
    const row = this.querySelector(`.day-row[data-day="${day}"]`);
    const editor = this.querySelector(`#${day}-editor`);
    const editBtn = this.querySelector(`.edit-btn[data-edit="${day}"]`);
    const applyBtn = this.querySelector(`#${day}-apply`);
    const applyGroupBtn = this.querySelector(`#${day}-apply-group`);
    const applyAllBtn = this.querySelector(`#${day}-apply-all`);
    const cancelBtn = this.querySelector(`#${day}-cancel`);
    
    // Basic editor toggle handlers
    if(editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();  // Stop event bubbling
        const editor = this.querySelector(`#${day}-editor`);
        if (editor) {
          editor.classList.toggle('visible');
          this.prefillEditor(day);
        }
      });
    }
    
    if(row) {
      row.addEventListener('click', e => {
        // Do not toggle editor if the click originated inside the editor itself,
        // or if it was on a button/input (those have their own handlers).
        if (e.target.closest('.day-editor')) {
          return;
        }
        if(!e.target.closest('button') && !e.target.closest('input')) {
          editor.classList.toggle('visible');
          this.prefillEditor(day);
        }
      });
    }
    
    // Apply button handlers based on schedule mode
    if (scheduleMode === '24 Hour') {
      if(applyAllBtn) {
        applyAllBtn.addEventListener('click', () => this.applySchedule(day, 'all'));
      }
    } else if (scheduleMode === 'Weekday/Weekend') {
      if(applyGroupBtn) {
        applyGroupBtn.addEventListener('click', () => this.applySchedule(day, 'group'));
      }
      if(applyAllBtn) {
        applyAllBtn.addEventListener('click', () => this.applySchedule(day, 'all'));
      }
    } else {
      // 7 Day mode
      if(applyBtn) {
        applyBtn.addEventListener('click', () => this.applySchedule(day, 'single'));
      }
      if(applyGroupBtn) {
        applyGroupBtn.addEventListener('click', () => this.applySchedule(day, 'group'));
      }
      if(applyAllBtn) {
        applyAllBtn.addEventListener('click', () => this.applySchedule(day, 'all'));
      }
    }
    
    // Cancel button handler
    if(cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editor.classList.remove('visible');
      });
    }
    
    // +/- buttons for time/temp controls: both should adjust the start time by ±30min
    for (let i = 1; i <= 4; i++) {
      const timeInc = this.querySelector(`#${day}-time-${i}-inc`);
      const timeDec = this.querySelector(`#${day}-time-${i}-dec`);
      const tempInc = this.querySelector(`#${day}-temp-${i}-inc`);
      const tempDec = this.querySelector(`#${day}-temp-${i}-dec`);
      
      if (timeInc) {
        timeInc.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.adjustStartTimeInput(`${day}-time-${i}`, 30);
        });
      }
      if (timeDec) {
        timeDec.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.adjustStartTimeInput(`${day}-time-${i}`, -30);
        });
      }
      // temp +/- now change the temperature value (±0.5°C) instead of the start time
      if (tempInc) {
        tempInc.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.adjustTempInput(`${day}-temp-${i}`, 0.5);
        });
      }
      if (tempDec) {
        tempDec.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.adjustTempInput(`${day}-temp-${i}`, -0.5);
        });
      }
    }
  });
}

// Helper: adjust a time input by deltaMinutes, clamp 00:00..23:30
adjustStartTimeInput(inputId, deltaMinutes) {
  const input = this.querySelector(`#${inputId}`);
  if (!input) return;
  let val = input.value;
  if (!val) {
    val = '00:00';
  }
  // Normalize "HH:MM" (ignore possible seconds)
  const parts = val.split(':');
  let hh = parseInt(parts[0], 10) || 0;
  let mm = parseInt(parts[1], 10) || 0;
  let total = hh * 60 + mm;
  total += deltaMinutes;
  if (total < 0) total = 0;
  const maxTotal = 23 * 60 + 30; // 23:30
  if (total > maxTotal) total = maxTotal;
  const newH = Math.floor(total / 60).toString().padStart(2, '0');
  const newM = (total % 60).toString().padStart(2, '0');
  const newVal = `${newH}:${newM}`;
  input.value = newVal;
  // If there's a corresponding time entity to update, call updateTimeValue
  // Try to infer entity id pattern: if input id corresponds to config device mapping we use updateTimeValue
  // For safety we do not auto-call HA services here unless time entities are mapped elsewhere.
}

// Helper: adjust a temp input by delta (step in °C), clamped to min/max attributes
adjustTempInput(inputId, delta) {
  const input = this.querySelector(`#${inputId}`);
  if (!input) return;
  const min = parseFloat(input.getAttribute('min')) || -Infinity;
  const max = parseFloat(input.getAttribute('max')) || Infinity;
  const step = parseFloat(input.getAttribute('step')) || 0.5;
  let val = parseFloat(input.value);
  if (Number.isNaN(val)) {
    // if empty, initialize to min or 0
    if (isFinite(min) && min !== -Infinity) {
      val = min;
    } else {
      val = 0;
    }
  }
  // apply delta and round to step precision
  let newVal = val + delta;
  // clamp
  if (newVal < min) newVal = min;
  if (newVal > max) newVal = max;
  // round to nearest step (avoid floating point imprecision)
  const precision = Math.round(1 / step);
  newVal = Math.round(newVal * precision) / precision;
  input.value = Number.isInteger(newVal) ? newVal.toString() : newVal.toFixed((step % 1) ? (step.toString().split('.')[1].length) : 0);
  // Optionally, if you want to push changes to Home Assistant number entities, call updateNumberValue here
  // e.g. this.updateNumberValue(numberEntityId, newVal);
}

async applySchedule(day, type = 'single') {
  const editor = this.querySelector(`#${day}-editor`);
  const registerValues = this.getRegisterValuesFromInputs(day);
  
  try {
    switch(type) {
      case 'single':
      // Single day update
      const dayIndex = this.dayOrder.indexOf(day);
      await this.writeRegisters(this.dayRegisterStartingByte[dayIndex], registerValues);
      break;
      
      case 'group':
      // Weekday/Weekend update
      const isWeekend = day === 'saturday' || day === 'sunday';
      if(isWeekend) {
        // Write to Saturday and Sunday separately
        await this.writeRegisters(this.dayRegisterStartingByte[5], registerValues, false); // Saturday
        await this.writeRegisters(this.dayRegisterStartingByte[6], registerValues); // Sunday
      } else {
        // Write to Monday-Friday in one call
        const weekdayValues = Array(5).fill(registerValues).flat();
        await this.writeRegisters(this.dayRegisterStartingByte[0], weekdayValues);
      }
      break;
      
      case 'all':
      // All days update
      const allDaysValues = [];
      // Start with Sunday (register 50)
      allDaysValues.push(...registerValues);
      // Then Monday through Saturday (registers 74-217)
      const remainingDaysValues = Array(6).fill(registerValues).flat();
      allDaysValues.push(...remainingDaysValues);
      await this.writeRegisters(50, allDaysValues);
      break;
    }
    
    editor.classList.remove('visible');
    
    // Wait for writes to complete before refreshing
    setTimeout(() => {
      this.readScheduleFromDevice();
      this.updateScheduleDisplay();
    }, 2000);
  } catch (error) {
    console.error('Error applying schedule:', error);
  }
}

renderAll() {
  console.log("Rendering all days at time "+new Date().toLocaleTimeString());
  this.dayOrder.forEach(day => this.renderDay(day));
}

renderDay(day) {
  const container = this.querySelector(`#${day}`);
  const ticker = this.querySelector(`#${day}-ticker`);
  const labels = this.querySelector(`#${day}-ticker-labels`);
  const slots = this.thermostatSchedule[day];
  if(!container || !ticker || !labels) return;
  
  container.innerHTML = '';
  if(slots.length===0) return;
  
  // Get previous day's last temperature
  const dayIndex = this.dayOrder.indexOf(day);
  const previousDay = this.dayOrder[(dayIndex - 1 + 7) % 7];
  const previousDaySlots = this.thermostatSchedule[previousDay];
  const previousDayLastTemp = previousDaySlots[previousDaySlots.length - 1].temp;
  
  // Build segments
  const firstSlotTime = this.parseTimeToMinutes(slots[0].time);
  
  // Add initial segment if first slot doesn't start at midnight
  if (firstSlotTime > 0) {
    const initialDiv = document.createElement('div');
    initialDiv.className = 'segment';
    initialDiv.style.width = (firstSlotTime / 1440 * 100) + '%';
    initialDiv.style.background = this.getColorForTemperature(previousDayLastTemp);
    initialDiv.textContent = previousDayLastTemp + '°';
    container.appendChild(initialDiv);
  }
  
  // Build remaining segments
  for(let i = 0; i < slots.length; i++) {
    const current = slots[i];
    const next = slots[i+1] || {time:'24:00'};
    const startMins = this.parseTimeToMinutes(current.time);
    const endMins = this.parseTimeToMinutes(next.time);
    const widthPercent = ((endMins-startMins)/1440)*100;
    const div = document.createElement('div');
    div.className = 'segment';
    div.style.width = widthPercent + '%';
    div.style.background = this.getColorForTemperature(current.temp);
    div.textContent = current.temp + '°';
    container.appendChild(div);
  }
  
  // Build tickers
  ticker.innerHTML='';
  labels.innerHTML='';
  for(let i=0;i<96;i++){
    const tick = document.createElement('div');
    tick.className='tick';
    if(i%4===0) tick.classList.add('hour');
    if(i%12===0) tick.classList.add('major');
    ticker.appendChild(tick);
  }
  for(let h=0;h<=24;h+=3){
    const lbl = document.createElement('div');
    lbl.className='tick-number';
    lbl.style.left=(h/24*100)+'%';
    lbl.textContent=h;
    labels.appendChild(lbl);
  }
}

updateScheduleDisplay() {
  console.log("Updating schedule display at " + new Date().toLocaleTimeString());
  
  const scheduleMode = this.getScheduleMode();
  let visibleDays;
  if (scheduleMode === 'Weekday/Weekend') {
    visibleDays = ['monday', 'saturday'];
  } else {
    visibleDays = this.dayOrder;
  }
  
  visibleDays.forEach(day => {
    const slots = this.thermostatSchedule[day];
    const currentSerialized = JSON.stringify(slots || []);
    // Skip updating this day if nothing changed since last render
    if (this._lastRenderedSchedule[day] === currentSerialized) {
      console.log(`No changes for ${day}, skipping update.`);
      return;
    }
    
    const container = this.querySelector(`#${day}`);
    if (!container) {
      // still update the cache so that future checks are correct
      this._lastRenderedSchedule[day] = currentSerialized;
      return;
    }
    
    // Proceed to update DOM for this day (existing update logic)
    // Get all existing segments
    const segments = container.querySelectorAll('.segment');
    
    // Get previous day's last temperature for the first segment
    const dayIndex = this.dayOrder.indexOf(day);
    const previousDay = this.dayOrder[(dayIndex - 1 + 7) % 7];
    const previousDaySlots = this.thermostatSchedule[previousDay];
    const previousDayLastTemp = previousDaySlots[previousDaySlots.length - 1].temp;
    
    // Calculate first slot time
    const firstSlotTime = slots.length > 0 ? this.parseTimeToMinutes(slots[0].time) : 0;
    
    // Update or create segments
    let currentSegments = Array.from(segments);
    
    // Update/create initial segment if needed
    if (firstSlotTime > 0) {
      if (currentSegments[0]) {
        // Update existing initial segment
        currentSegments[0].style.width = (firstSlotTime / 1440 * 100) + '%';
        currentSegments[0].style.background = this.getColorForTemperature(previousDayLastTemp);
        currentSegments[0].textContent = previousDayLastTemp + '°';
      } else {
        // Create new initial segment
        const initialDiv = document.createElement('div');
        initialDiv.className = 'segment';
        initialDiv.style.width = (firstSlotTime / 1440 * 100) + '%';
        initialDiv.style.background = this.getColorForTemperature(previousDayLastTemp);
        initialDiv.textContent = previousDayLastTemp + '°';
        container.appendChild(initialDiv);
      }
      currentSegments = currentSegments.slice(1);
    } else {
      // If there's no initial segment but one exists in DOM, ensure we treat segments correctly
      // leave currentSegments as-is (no slice)
    }
    
    // Update remaining segments
    slots.forEach((slot, i) => {
      const next = slots[i + 1] || { time: '24:00' };
      const startMins = this.parseTimeToMinutes(slot.time);
      const endMins = this.parseTimeToMinutes(next.time);
      const widthPercent = ((endMins - startMins) / 1440) * 100;
      
      if (currentSegments[i]) {
        // Update existing segment
        currentSegments[i].style.width = widthPercent + '%';
        currentSegments[i].style.background = this.getColorForTemperature(slot.temp);
        currentSegments[i].textContent = slot.temp + '°';
      } else {
        // Create new segment if needed
        const div = document.createElement('div');
        div.className = 'segment';
        div.style.width = widthPercent + '%';
        div.style.background = this.getColorForTemperature(slot.temp);
        div.textContent = slot.temp + '°';
        container.appendChild(div);
      }
    });
    
    // Remove any excess segments
    const totalSegmentsNeeded = slots.length + (firstSlotTime > 0 ? 1 : 0);
    while (container.children.length > totalSegmentsNeeded) {
      container.removeChild(container.lastChild);
    }
    
    // Update editor fields if visible
    const editor = this.querySelector(`#${day}-editor`);
    if (editor && editor.classList.contains('visible')) {
      slots.forEach((slot, i) => {
        const timeInput = this.querySelector(`#${day}-time-${i + 1}`);
        const tempInput = this.querySelector(`#${day}-temp-${i + 1}`);
        if (timeInput) timeInput.value = slot.time;
        if (tempInput) tempInput.value = slot.temp;
      });
    }
    
    // Mark this day's schedule as rendered
    this._lastRenderedSchedule[day] = currentSerialized;
    console.log(`Updated display for ${day}`)
  });
}

// Add this helper function after the constructor
async writeRegisters(registerStart, values, isLastWrite = true) {
  await this._hass.callService('heatmiser_edge', 'write_register_range', {
    device_id: ['4e03fdc94f493c4af45a120ad23013e5'],
    register: registerStart,
    values: values.join(','),
    refresh_values_after_writing: isLastWrite
  });
}

// Add this new method to find the climate entity
findClimateEntityFromDevice(deviceId) {
  if (!this._hass || !deviceId) {
    return null;
  }
  
  const entities = this._hass.entities || {};
  
  for (const [entityId, entity] of Object.entries(entities)) {
    if (entity.device_id === deviceId && 
      entityId.startsWith('climate.') && 
      entityId.includes('thermostat')) {
        return entityId;
      }
    }
    
    return null;
  }
  
  setConfig(config) {
    console.log("Setting config");
    if (!config.device) {
      throw new Error("You need to define a device");
    }
    this.config = config;
  }
  
  getColorForTemperature(temp) {
    if (temp < 15) {
      return '#185fb6';
    }
    if (temp < 19) {
      return '#00bcd4';
    }
    if (temp < 23) {
      return '#ffc107';
    }
    if (temp >= 23) {
      return '#e53935';
    }
    return '#fdd835';
  }
  
  prefillEditor(day){
    for(let i=1;i<=4;i++){
      const entry = this.thermostatSchedule[day][i-1];
      if(entry){
        this.querySelector(`#${day}-time-${i}`).value = entry.time;
        this.querySelector(`#${day}-temp-${i}`).value = entry.temp;
      }
    }
  }
  
  parseTimeToMinutes(time) {
    const [hh, mm] = time.split(':').map(Number);
    return hh * 60 + mm;
  }
  
  getRegisterValuesFromInputs(day) {
    const registerValues = [];
    
    // Get all periods (up to 6)
    for(let i=1; i<=6; i++) {
      if(i <= 4) {
        const timeInput = this.querySelector(`#${day}-time-${i}`);
        const tempInput = this.querySelector(`#${day}-temp-${i}`);
        
        if(timeInput?.value && tempInput?.value) {
          const [hours, minutes] = timeInput.value.split(':').map(Number);
          const temp = Math.round(parseFloat(tempInput.value) * 10);
          registerValues.push(hours, minutes, temp, 0);
        }
      } else {
        // Add default values for periods 5-6
        registerValues.push(24, 0, 160, 0);
      }
    }
    
    return registerValues;
  }
  
  getScheduleMode() {
    const entityId = this.entity;
    const modeEntityId = entityId.replace('climate.', 'select.').replace('_thermostat', '_schedule_mode');
    const modeState = this._hass?.states[modeEntityId];
    console.log(`Schedule mode entity: ${modeEntityId}, state: ${modeState?.state}`);
    
    if (modeState && modeState.state) {
      return modeState.state;
    } else {
      return 'Full Week';
    }
  }
}

customElements.define('heatmiseredge-schedule-card', HeatmiserEdgeScheduleCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "heatmiseredge-schedule-card",
  name: "Heatmiser Edge schedule card",
  preview: false, // Optional - defaults to false
  description: "Allows you to easily modify the schedules on your Heatmiser edge thermostats", // Optional
  documentationURL:
    "https://github.com/sftgunner/heatmiseredge-schedule-card", // Adds a help link in the frontend card editor
});