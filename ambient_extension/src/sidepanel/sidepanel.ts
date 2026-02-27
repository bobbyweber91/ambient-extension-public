/**
 * Side panel UI controller
 * Handles settings, status display, and event extraction workflow
 */

import type { ExtensionStatus, ExtractedEvent, MatchResult, ConversationDict, CalendarEvent, FieldDifferences, DateTimeInfo } from '../types';
import { 
  saveGeminiKey, 
  getGeminiKey,
  removeGeminiKey,
  saveUserName, 
  getUserName,
  hasGeminiKey,
  validateGeminiKey,
  isCalendarConnected,
  saveAIProvider,
  getAIProvider,
  isAIProviderConfigured,
  saveScrollBackDays,
  getScrollBackDays,
  saveDebugMode,
  getDebugMode,
  getDailyExtractCount,
  incrementDailyExtractCount,
  setDailyExtractCount,
  isDailyExtractLimitReached,
  getDailyExtractLimit,
  saveIsAmbientUser,
  getIsAmbientUser,
  DAILY_EXTRACT_LIMIT,
  type AIProvider
} from '../lib/storage';
import {
  getCalendarToken,
  disconnectCalendar,
  getConnectionStatus
} from '../lib/calendarAuth';
import { getPrimaryCalendar, getEvents, getEventsFromAllCalendars, getDateRange, createEvent, updateEvent, getOrCreateAmbientCalendar } from '../lib/calendarApi';
import { generateEventExtractionPrompt } from '../llm/extraction';
import { generateMatchInstructions } from '../llm/matching';
import { formatDateTimeForDisplay, hasDifferences } from '../llm/matching';

// UI Elements
let statusEl: HTMLElement | null;
let extractBtn: HTMLButtonElement | null;
let resultsEl: HTMLElement | null;
let logEl: HTMLElement | null;
let apiKeyInput: HTMLInputElement | null;
let userNameInput: HTMLInputElement | null;
let saveKeyBtn: HTMLElement | null;
let saveNameBtn: HTMLElement | null;
let apiKeyInputRow: HTMLElement | null;
let apiKeyDisplayRow: HTMLElement | null;
let deleteKeyBtn: HTMLElement | null;
let actionHint: HTMLElement | null;
let conversationSection: HTMLElement | null;
let convTitle: HTMLElement | null;
let convStats: HTMLElement | null;
let connectCalendarBtn: HTMLElement | null;
let calendarStatusEl: HTMLElement | null;

// View Elements
let getStartedView: HTMLElement | null;
let mainView: HTMLElement | null;
let settingsModal: HTMLElement | null;
let settingsBtn: HTMLElement | null;
let closeSettingsBtn: HTMLElement | null;

// Get Started Progress Steps
let stepName: HTMLElement | null;
let stepAIProvider: HTMLElement | null;
let stepCalendar: HTMLElement | null;

// AI Provider Selection Elements
let providerAmbientRadio: HTMLInputElement | null;
let providerGeminiRadio: HTMLInputElement | null;
let geminiKeySection: HTMLElement | null;
let modalProviderAmbientRadio: HTMLInputElement | null;
let modalProviderGeminiRadio: HTMLInputElement | null;
let modalGeminiKeySection: HTMLElement | null;

// Modal Settings Elements
let modalUserNameInput: HTMLInputElement | null;
let modalApiKeyInput: HTMLInputElement | null;
let modalSaveNameBtn: HTMLElement | null;
let modalSaveKeyBtn: HTMLElement | null;
let modalApiKeyInputRow: HTMLElement | null;
let modalApiKeyDisplayRow: HTMLElement | null;
let modalDeleteKeyBtn: HTMLElement | null;
let modalConnectCalendarBtn: HTMLElement | null;
let modalCalendarStatusEl: HTMLElement | null;

// Error Elements
let apiKeyError: HTMLElement | null;
let modalApiKeyError: HTMLElement | null;
let errorBanner: HTMLElement | null;
let errorMessage: HTMLElement | null;
let dismissErrorBtn: HTMLElement | null;

// Ambient Profile Elements
let profileStatusIndicator: HTMLElement | null;
let profileStatusText: HTMLElement | null;
let profileInfoUnconnected: HTMLElement | null;
let checkProfileBtn: HTMLButtonElement | null;
let modalProfileStatusIndicator: HTMLElement | null;
let modalProfileStatusText: HTMLElement | null;
let modalProfileInfoUnconnected: HTMLElement | null;
let modalCheckProfileBtn: HTMLButtonElement | null;

// Matched Events UI Elements
let matchedSection: HTMLElement | null;
let matchedResultsEl: HTMLElement | null;

// Debug UI Elements
let debugDomInfoBtn: HTMLButtonElement | null;
let debugGetConvBtn: HTMLButtonElement | null;
let debugConvPromptBtn: HTMLButtonElement | null;
let debugCalendarInputBtn: HTMLButtonElement | null;
let debugMatchPromptBtn: HTMLButtonElement | null;
let debugEventsSection: HTMLElement | null;
let debugEventsJson: HTMLTextAreaElement | null;
let debugLoadEventsBtn: HTMLButtonElement | null;
let debugOutput: HTMLElement | null;
let debugEventSelect: HTMLSelectElement | null;
let debugSection: HTMLElement | null;
let logSection: HTMLElement | null;
let modalDebugToggle: HTMLInputElement | null;

// Scroll Back Days UI Element
let scrollBackDaysInput: HTMLInputElement | null;

// Mode Selection View Elements
let modeSelectView: HTMLElement | null;
let modeMessagesBtn: HTMLElement | null;
let modeImportBtn: HTMLElement | null;
let modeSettingsBtn: HTMLElement | null;

// Import View Elements
let importView: HTMLElement | null;
let importBackBtn: HTMLElement | null;
let importSettingsBtn: HTMLElement | null;
let importExtractBtn: HTMLButtonElement | null;
let importStatusEl: HTMLElement | null;
let importResultsEl: HTMLElement | null;
let importMatchedSection: HTMLElement | null;
let importMatchedResultsEl: HTMLElement | null;
let importLogEl: HTMLElement | null;
let importErrorBanner: HTMLElement | null;
let importErrorMessage: HTMLElement | null;
let importDismissErrorBtn: HTMLElement | null;
let fileDropzone: HTMLElement | null;
let fileInput: HTMLInputElement | null;
let fileSelected: HTMLElement | null;
let fileNameEl: HTMLElement | null;
let fileRemoveBtn: HTMLElement | null;
let mainBackBtn: HTMLElement | null;

// Import State
let selectedFile: File | null = null;

// State
let currentStatus: ExtensionStatus = 'idle';
let lastParsedConversation: ConversationDict | null = null;
let lastExtractedEvents: ExtractedEvent[] | null = null;
let lastMatchResults: MatchResult[] | null = null;

// Debug State
let debugConversation: ConversationDict | null = null;
let debugExtractedEvents: ExtractedEvent[] | null = null;
let debugCalendarInput: CalendarEvent[] | null = null;

// Edit State - stores user modifications to match cards
let editedEvents: Map<string, Partial<CalendarEvent>> = new Map();
let cardsInEditMode: Set<string> = new Set();

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: { field: string; message: string }[];
}

/**
 * Initialize the side panel when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Get UI elements
  statusEl = document.getElementById('status');
  extractBtn = document.getElementById('extract-btn') as HTMLButtonElement;
  resultsEl = document.getElementById('results');
  logEl = document.getElementById('log');
  apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  userNameInput = document.getElementById('user-name') as HTMLInputElement;
  saveKeyBtn = document.getElementById('save-key-btn');
  saveNameBtn = document.getElementById('save-name-btn');
  apiKeyInputRow = document.getElementById('api-key-input-row');
  apiKeyDisplayRow = document.getElementById('api-key-display-row');
  deleteKeyBtn = document.getElementById('delete-key-btn');
  actionHint = document.getElementById('action-hint');
  conversationSection = document.getElementById('conversation-section');
  convTitle = document.getElementById('conv-title');
  convStats = document.getElementById('conv-stats');
  connectCalendarBtn = document.getElementById('connect-calendar-btn');
  calendarStatusEl = document.getElementById('calendar-status');

  // View elements
  getStartedView = document.getElementById('get-started-view');
  mainView = document.getElementById('main-view');
  settingsModal = document.getElementById('settings-modal');
  settingsBtn = document.getElementById('settings-btn');
  closeSettingsBtn = document.getElementById('close-settings-btn');

  // Get Started progress steps
  stepName = document.getElementById('step-name');
  stepAIProvider = document.getElementById('step-ai-provider');
  stepCalendar = document.getElementById('step-calendar');

  // AI Provider selection elements
  providerAmbientRadio = document.getElementById('provider-ambient') as HTMLInputElement;
  providerGeminiRadio = document.getElementById('provider-gemini') as HTMLInputElement;
  geminiKeySection = document.getElementById('gemini-key-section');
  modalProviderAmbientRadio = document.getElementById('modal-provider-ambient') as HTMLInputElement;
  modalProviderGeminiRadio = document.getElementById('modal-provider-gemini') as HTMLInputElement;
  modalGeminiKeySection = document.getElementById('modal-gemini-key-section');

  // Modal settings elements
  modalUserNameInput = document.getElementById('modal-user-name') as HTMLInputElement;
  modalApiKeyInput = document.getElementById('modal-api-key') as HTMLInputElement;
  modalSaveNameBtn = document.getElementById('modal-save-name-btn');
  modalSaveKeyBtn = document.getElementById('modal-save-key-btn');
  modalApiKeyInputRow = document.getElementById('modal-api-key-input-row');
  modalApiKeyDisplayRow = document.getElementById('modal-api-key-display-row');
  modalDeleteKeyBtn = document.getElementById('modal-delete-key-btn');
  modalConnectCalendarBtn = document.getElementById('modal-connect-calendar-btn');
  modalCalendarStatusEl = document.getElementById('modal-calendar-status');

  // Error elements
  apiKeyError = document.getElementById('api-key-error');
  modalApiKeyError = document.getElementById('modal-api-key-error');
  errorBanner = document.getElementById('error-banner');
  errorMessage = document.getElementById('error-message');
  dismissErrorBtn = document.getElementById('dismiss-error-btn');

  // Ambient Profile elements
  profileStatusIndicator = document.getElementById('profile-status-indicator');
  profileStatusText = document.getElementById('profile-status-text');
  profileInfoUnconnected = document.getElementById('profile-info-unconnected');
  checkProfileBtn = document.getElementById('check-profile-btn') as HTMLButtonElement;
  modalProfileStatusIndicator = document.getElementById('modal-profile-status-indicator');
  modalProfileStatusText = document.getElementById('modal-profile-status-text');
  modalCheckProfileBtn = document.getElementById('modal-check-profile-btn') as HTMLButtonElement;
  modalProfileInfoUnconnected = document.getElementById('modal-profile-info-unconnected');

  // Matched Events UI elements
  matchedSection = document.getElementById('matched-section');
  matchedResultsEl = document.getElementById('matched-results');

  // Debug UI elements
  debugDomInfoBtn = document.getElementById('debug-dom-info') as HTMLButtonElement;
  debugGetConvBtn = document.getElementById('debug-get-conv') as HTMLButtonElement;
  debugConvPromptBtn = document.getElementById('debug-conv-prompt') as HTMLButtonElement;
  debugCalendarInputBtn = document.getElementById('debug-calendar-input') as HTMLButtonElement;
  debugMatchPromptBtn = document.getElementById('debug-match-prompt') as HTMLButtonElement;
  debugEventsSection = document.getElementById('debug-events-section');
  debugEventsJson = document.getElementById('debug-events-json') as HTMLTextAreaElement;
  debugLoadEventsBtn = document.getElementById('debug-load-events') as HTMLButtonElement;
  debugOutput = document.getElementById('debug-output');
  debugEventSelect = document.getElementById('debug-event-select') as HTMLSelectElement;
  
  // Debug sections and toggle
  debugSection = document.querySelector('.debug-section');
  logSection = document.querySelector('.log-section');
  modalDebugToggle = document.getElementById('modal-debug-toggle') as HTMLInputElement;

  // Scroll back days input
  scrollBackDaysInput = document.getElementById('scroll-back-days') as HTMLInputElement;

  // Mode Selection View elements
  modeSelectView = document.getElementById('mode-select-view');
  modeMessagesBtn = document.getElementById('mode-messages-btn');
  modeImportBtn = document.getElementById('mode-import-btn');
  modeSettingsBtn = document.getElementById('mode-settings-btn');

  // Import View elements
  importView = document.getElementById('import-view');
  importBackBtn = document.getElementById('import-back-btn');
  importSettingsBtn = document.getElementById('import-settings-btn');
  importExtractBtn = document.getElementById('import-extract-btn') as HTMLButtonElement;
  importStatusEl = document.getElementById('import-status');
  importResultsEl = document.getElementById('import-results');
  importMatchedSection = document.getElementById('import-matched-section');
  importMatchedResultsEl = document.getElementById('import-matched-results');
  importLogEl = document.getElementById('import-log');
  importErrorBanner = document.getElementById('import-error-banner');
  importErrorMessage = document.getElementById('import-error-message');
  importDismissErrorBtn = document.getElementById('import-dismiss-error-btn');
  fileDropzone = document.getElementById('file-dropzone');
  fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileSelected = document.getElementById('file-selected');
  fileNameEl = document.getElementById('file-name');
  fileRemoveBtn = document.getElementById('file-remove-btn');
  mainBackBtn = document.getElementById('main-back-btn');

  // Set up event listeners - Get Started view
  extractBtn?.addEventListener('click', handleExtractClick);
  saveKeyBtn?.addEventListener('click', handleSaveApiKey);
  saveNameBtn?.addEventListener('click', handleSaveUserName);
  deleteKeyBtn?.addEventListener('click', handleDeleteApiKey);
  connectCalendarBtn?.addEventListener('click', handleCalendarConnect);

  // AI Provider selection listeners
  providerAmbientRadio?.addEventListener('change', handleProviderChange);
  providerGeminiRadio?.addEventListener('change', handleProviderChange);
  modalProviderAmbientRadio?.addEventListener('change', handleModalProviderChange);
  modalProviderGeminiRadio?.addEventListener('change', handleModalProviderChange);

  // Set up event listeners - Settings modal
  settingsBtn?.addEventListener('click', showSettingsModal);
  closeSettingsBtn?.addEventListener('click', hideSettingsModal);
  settingsModal?.addEventListener('click', handleModalOverlayClick);
  modalSaveNameBtn?.addEventListener('click', handleModalSaveUserName);
  modalSaveKeyBtn?.addEventListener('click', handleModalSaveApiKey);
  modalDeleteKeyBtn?.addEventListener('click', handleModalDeleteApiKey);
  modalConnectCalendarBtn?.addEventListener('click', handleModalCalendarConnect);
  dismissErrorBtn?.addEventListener('click', hideErrorBanner);

  // Ambient Profile check listeners
  checkProfileBtn?.addEventListener('click', handleCheckProfile);
  modalCheckProfileBtn?.addEventListener('click', handleCheckProfile);

  // Debug event listeners
  debugDomInfoBtn?.addEventListener('click', handleDebugDomInfo);
  debugGetConvBtn?.addEventListener('click', handleDebugGetConversation);
  debugConvPromptBtn?.addEventListener('click', handleDebugConversationPrompt);
  debugCalendarInputBtn?.addEventListener('click', handleDebugCalendarInput);
  debugMatchPromptBtn?.addEventListener('click', handleDebugMatchPrompt);
  debugLoadEventsBtn?.addEventListener('click', handleDebugLoadEvents);

  // Scroll back days event listener
  scrollBackDaysInput?.addEventListener('change', handleScrollBackDaysChange);

  // Debug toggle event listener
  modalDebugToggle?.addEventListener('change', handleDebugToggleChange);

  // Mode selection listeners
  modeMessagesBtn?.addEventListener('click', () => showView('main'));
  modeImportBtn?.addEventListener('click', () => showView('import'));
  modeSettingsBtn?.addEventListener('click', showSettingsModal);
  mainBackBtn?.addEventListener('click', () => showView('mode-select'));

  // Import view listeners
  importBackBtn?.addEventListener('click', () => showView('mode-select'));
  importSettingsBtn?.addEventListener('click', showSettingsModal);
  importExtractBtn?.addEventListener('click', handleImportExtractClick);
  importDismissErrorBtn?.addEventListener('click', hideImportErrorBanner);
  fileDropzone?.addEventListener('click', () => fileInput?.click());
  fileDropzone?.addEventListener('dragover', handleDragOver);
  fileDropzone?.addEventListener('dragleave', handleDragLeave);
  fileDropzone?.addEventListener('drop', handleFileDrop);
  fileInput?.addEventListener('change', handleFileSelect);
  fileRemoveBtn?.addEventListener('click', handleFileRemove);

  // Load saved settings and determine which view to show
  await loadSettings();

  // Check if daily limit is reached and update button state
  await updateExtractButtonState();

  // Update ambient profile status display
  await updateAmbientProfileStatus();

  updateStatus('idle');
  log('Extension ready. Open a Google Messages conversation to begin.');
});

/**
 * Load saved settings from storage
 */
async function loadSettings() {
  try {
    const [hasKey, userName, calendarStatus, aiProvider, scrollBackDays, debugMode] = await Promise.all([
      hasGeminiKey(),
      getUserName(),
      getConnectionStatus(),
      getAIProvider(),
      getScrollBackDays(),
      getDebugMode()
    ]);

    // Set scroll back days input value
    if (scrollBackDaysInput) {
      scrollBackDaysInput.value = scrollBackDays.toString();
    }

    // Set debug toggle and update visibility
    if (modalDebugToggle) {
      modalDebugToggle.checked = debugMode;
    }
    updateDebugSectionsVisibility(debugMode);

    // Set AI provider radio buttons based on saved value
    updateProviderSelection(aiProvider);
    updateModalProviderSelection(aiProvider);

    // Show/hide API key section based on provider
    updateGeminiKeySectionVisibility(aiProvider);
    updateModalGeminiKeySectionVisibility(aiProvider);

    // Show appropriate API key UI based on whether key exists (both views)
    updateApiKeyDisplay(hasKey);
    updateModalApiKeyDisplay(hasKey);

    // Populate user name fields
    if (userName) {
      if (userNameInput) userNameInput.value = userName;
      if (modalUserNameInput) modalUserNameInput.value = userName;
    }

    // Update calendar connection status (both views)
    updateCalendarStatusDisplay(calendarStatus.connected);
    updateModalCalendarStatus(calendarStatus.connected);

    // Check if AI provider is configured (AmbientAI always is, Gemini needs key)
    const aiConfigured = await isAIProviderConfigured();

    // Update setup progress indicators
    updateSetupProgress(!!userName, aiConfigured, calendarStatus.connected);

    // Determine which view to show
    const setupComplete = checkSetupComplete(!!userName, aiConfigured, calendarStatus.connected);
    showView(setupComplete ? 'mode-select' : 'get-started');

    log('Settings loaded');
  } catch (error) {
    log(`Error loading settings: ${(error as Error).message}`);
  }
}

/**
 * Check if all setup requirements are met
 */
function checkSetupComplete(hasName: boolean, aiConfigured: boolean, hasCalendar: boolean): boolean {
  return hasName && aiConfigured && hasCalendar;
}

/**
 * Show the specified view
 */
function showView(viewName: 'get-started' | 'mode-select' | 'main' | 'import') {
  const allViews = [getStartedView, modeSelectView, mainView, importView];
  allViews.forEach(v => v?.classList.remove('active'));

  switch (viewName) {
    case 'get-started':
      getStartedView?.classList.add('active');
      break;
    case 'mode-select':
      modeSelectView?.classList.add('active');
      break;
    case 'main':
      mainView?.classList.add('active');
      break;
    case 'import':
      importView?.classList.add('active');
      break;
  }
}

/**
 * Update the setup progress indicators in Get Started view
 */
function updateSetupProgress(hasName: boolean, aiConfigured: boolean, hasCalendar: boolean) {
  if (stepName) {
    stepName.classList.toggle('completed', hasName);
  }
  if (stepAIProvider) {
    stepAIProvider.classList.toggle('completed', aiConfigured);
  }
  if (stepCalendar) {
    stepCalendar.classList.toggle('completed', hasCalendar);
  }
}

/**
 * Check setup status and transition to main view if complete
 */
async function checkAndTransitionToMainView() {
  const [aiConfigured, userName, calendarStatus] = await Promise.all([
    isAIProviderConfigured(),
    getUserName(),
    getConnectionStatus()
  ]);

  updateSetupProgress(!!userName, aiConfigured, calendarStatus.connected);

  if (checkSetupComplete(!!userName, aiConfigured, calendarStatus.connected)) {
    showView('mode-select');
  }
}

/**
 * Update the API key UI to show either input mode or display mode
 */
function updateApiKeyDisplay(hasKey: boolean) {
  if (apiKeyInputRow && apiKeyDisplayRow) {
    if (hasKey) {
      // Show masked display with delete button
      apiKeyInputRow.style.display = 'none';
      apiKeyDisplayRow.style.display = 'flex';
      // Hide error when key is saved
      hideApiKeyError('get-started');
    } else {
      // Show input field with save button
      apiKeyInputRow.style.display = 'flex';
      apiKeyDisplayRow.style.display = 'none';
      if (apiKeyInput) {
        apiKeyInput.value = '';
        apiKeyInput.placeholder = 'AIza...';
      }
    }
  }
}

/**
 * Handle saving the API key (Get Started view)
 * 
 * Best Practice: Validate the API key before saving to catch errors early.
 */
async function handleSaveApiKey() {
  const key = apiKeyInput?.value?.trim();
  if (!key) {
    log('Please enter an API key');
    showApiKeyError('Please enter an API key', 'get-started');
    return;
  }

  // Clear any previous errors
  hideApiKeyError('get-started');

  try {
    // First validate format
    await saveGeminiKey(key);
    
    // Then validate it actually works
    log('Validating API key...');
    if (saveKeyBtn) saveKeyBtn.textContent = 'Validating...';
    
    const validation = await validateGeminiKey(key);
    
    if (!validation.valid) {
      log(`API key invalid: ${validation.error}`);
      showApiKeyError(validation.error || 'Invalid API key', 'get-started');
      if (saveKeyBtn) saveKeyBtn.textContent = 'Save';
      return;
    }
    
    log('API key saved and validated successfully');
    
    // Switch to display mode showing masked key (both views)
    updateApiKeyDisplay(true);
    updateModalApiKeyDisplay(true);
    
    // Visual feedback
    if (saveKeyBtn) {
      saveKeyBtn.textContent = 'Saved!';
      setTimeout(() => {
        if (saveKeyBtn) saveKeyBtn.textContent = 'Save';
      }, 1500);
    }

    // Check if setup is now complete
    await checkAndTransitionToMainView();
  } catch (error) {
    log(`Error saving API key: ${(error as Error).message}`);
    showApiKeyError((error as Error).message, 'get-started');
    if (saveKeyBtn) saveKeyBtn.textContent = 'Save';
  }
}

/**
 * Handle deleting the API key (Get Started view)
 */
async function handleDeleteApiKey() {
  try {
    await removeGeminiKey();
    log('API key deleted');
    
    // Switch back to input mode (both views)
    updateApiKeyDisplay(false);
    updateModalApiKeyDisplay(false);
    
    // Update progress indicators
    const [userName, calendarStatus, aiConfigured] = await Promise.all([
      getUserName(), 
      getConnectionStatus(),
      isAIProviderConfigured()
    ]);
    updateSetupProgress(!!userName, aiConfigured, calendarStatus.connected);
  } catch (error) {
    log(`Error deleting API key: ${(error as Error).message}`);
  }
}

// ============ AI Provider Selection Functions ============

/**
 * Update the provider radio button selection (Get Started view)
 */
function updateProviderSelection(provider: AIProvider) {
  if (providerAmbientRadio && providerGeminiRadio) {
    providerAmbientRadio.checked = provider === 'ambient_ai';
    providerGeminiRadio.checked = provider === 'gemini_key';
  }
}

/**
 * Update the provider radio button selection (Modal)
 */
function updateModalProviderSelection(provider: AIProvider) {
  if (modalProviderAmbientRadio && modalProviderGeminiRadio) {
    modalProviderAmbientRadio.checked = provider === 'ambient_ai';
    modalProviderGeminiRadio.checked = provider === 'gemini_key';
  }
}

/**
 * Show/hide the Gemini API key section based on provider (Get Started view)
 */
function updateGeminiKeySectionVisibility(provider: AIProvider) {
  if (geminiKeySection) {
    geminiKeySection.style.display = provider === 'gemini_key' ? 'block' : 'none';
  }
}

/**
 * Show/hide the Gemini API key section based on provider (Modal)
 */
function updateModalGeminiKeySectionVisibility(provider: AIProvider) {
  if (modalGeminiKeySection) {
    modalGeminiKeySection.style.display = provider === 'gemini_key' ? 'block' : 'none';
  }
}

/**
 * Handle AI provider change (Get Started view)
 */
async function handleProviderChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const provider = target.value as AIProvider;
  
  try {
    await saveAIProvider(provider);
    log(`AI provider changed to: ${provider === 'ambient_ai' ? 'AmbientAI' : 'Gemini API Key'}`);
    
    // Update visibility of API key section
    updateGeminiKeySectionVisibility(provider);
    
    // Sync to modal
    updateModalProviderSelection(provider);
    updateModalGeminiKeySectionVisibility(provider);
    
    // Update extract button state (rate limit only applies to Ambient AI)
    await updateExtractButtonState();
    
    // Check if setup is now complete
    await checkAndTransitionToMainView();
  } catch (error) {
    log(`Error saving AI provider: ${(error as Error).message}`);
  }
}

/**
 * Handle AI provider change (Modal)
 */
async function handleModalProviderChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const provider = target.value as AIProvider;
  
  try {
    await saveAIProvider(provider);
    log(`AI provider changed to: ${provider === 'ambient_ai' ? 'AmbientAI' : 'Gemini API Key'}`);
    
    // Update visibility of API key section
    updateModalGeminiKeySectionVisibility(provider);
    
    // Sync to get started view
    updateProviderSelection(provider);
    updateGeminiKeySectionVisibility(provider);
    
    // Update extract button state (rate limit only applies to Ambient AI)
    await updateExtractButtonState();
    
    // Update progress indicators
    const [userName, calendarStatus, aiConfigured] = await Promise.all([
      getUserName(),
      getConnectionStatus(),
      isAIProviderConfigured()
    ]);
    updateSetupProgress(!!userName, aiConfigured, calendarStatus.connected);
  } catch (error) {
    log(`Error saving AI provider: ${(error as Error).message}`);
  }
}

/**
 * Handle saving the user name (Get Started view)
 */
async function handleSaveUserName() {
  const name = userNameInput?.value?.trim();
  if (!name) {
    log('Please enter your name');
    return;
  }

  try {
    await saveUserName(name);
    log(`User name saved: ${name}`);
    
    // Sync to modal input
    if (modalUserNameInput) {
      modalUserNameInput.value = name;
    }
    
    // Visual feedback
    if (saveNameBtn) {
      const originalText = saveNameBtn.textContent;
      saveNameBtn.textContent = 'Saved!';
      setTimeout(() => {
        if (saveNameBtn) saveNameBtn.textContent = originalText;
      }, 1500);
    }

    // Check if setup is now complete
    await checkAndTransitionToMainView();
  } catch (error) {
    log(`Error saving user name: ${(error as Error).message}`);
  }
}

/**
 * Handle Google Calendar connection (Get Started view)
 * 
 * Best Practice: Use Chrome Identity API for OAuth, show clear status to user.
 */
async function handleCalendarConnect() {
  const status = await getConnectionStatus();
  
  if (status.connected) {
    // Already connected - offer to disconnect
    if (confirm('Disconnect from Google Calendar?')) {
      try {
        await disconnectCalendar();
        log('Calendar disconnected');
        await updateCalendarStatus();
        
        // Update progress indicators
        const [hasKey, userName] = await Promise.all([hasGeminiKey(), getUserName()]);
        updateSetupProgress(!!userName, hasKey, false);
      } catch (error) {
        log(`Error disconnecting: ${(error as Error).message}`);
      }
    }
    return;
  }
  
  // Not connected - initiate OAuth flow
  try {
    log('Connecting to Google Calendar...');
    if (connectCalendarBtn) connectCalendarBtn.textContent = 'Connecting...';
    
    await getCalendarToken(true);
    
    // Verify we can actually access the calendar
    const calendar = await getPrimaryCalendar();
    if (calendar) {
      log(`Connected to calendar: ${calendar.summary}`);
    } else {
      log('Connected to Google Calendar');
    }
    
    await updateCalendarStatus();
    
    // Check if setup is now complete
    await checkAndTransitionToMainView();
    
  } catch (error) {
    log(`Calendar connection failed: ${(error as Error).message}`);
    await updateCalendarStatus();
  }
}

/**
 * Update the calendar connection status display
 */
async function updateCalendarStatus() {
  const status = await getConnectionStatus();
  updateCalendarStatusDisplay(status.connected);
  updateModalCalendarStatus(status.connected);
}

/**
 * Update the calendar status display in Get Started view
 */
function updateCalendarStatusDisplay(connected: boolean) {
  if (calendarStatusEl) {
    if (connected) {
      calendarStatusEl.textContent = 'Connected';
      calendarStatusEl.className = 'calendar-status connected';
    } else {
      calendarStatusEl.textContent = 'Not connected';
      calendarStatusEl.className = 'calendar-status';
    }
  }
  
  if (connectCalendarBtn) {
    connectCalendarBtn.textContent = connected ? 'Disconnect' : 'Connect';
  }
}

/**
 * Update the calendar status display in the modal
 */
function updateModalCalendarStatus(connected: boolean) {
  if (modalCalendarStatusEl) {
    if (connected) {
      modalCalendarStatusEl.textContent = 'Connected';
      modalCalendarStatusEl.className = 'calendar-status connected';
    } else {
      modalCalendarStatusEl.textContent = 'Not connected';
      modalCalendarStatusEl.className = 'calendar-status';
    }
  }
  
  if (modalConnectCalendarBtn) {
    modalConnectCalendarBtn.textContent = connected ? 'Disconnect' : 'Connect';
  }
}

/**
 * Update the API key display in the modal
 */
function updateModalApiKeyDisplay(hasKey: boolean) {
  if (modalApiKeyInputRow && modalApiKeyDisplayRow) {
    if (hasKey) {
      modalApiKeyInputRow.style.display = 'none';
      modalApiKeyDisplayRow.style.display = 'flex';
      // Hide error when key is saved
      hideApiKeyError('modal');
    } else {
      modalApiKeyInputRow.style.display = 'flex';
      modalApiKeyDisplayRow.style.display = 'none';
      if (modalApiKeyInput) {
        modalApiKeyInput.value = '';
        modalApiKeyInput.placeholder = 'AIza...';
      }
    }
  }
}

/**
 * Show API key error message
 */
function showApiKeyError(message: string, view: 'get-started' | 'modal') {
  const errorEl = view === 'get-started' ? apiKeyError : modalApiKeyError;
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }
}

/**
 * Hide API key error message
 */
function hideApiKeyError(view: 'get-started' | 'modal') {
  const errorEl = view === 'get-started' ? apiKeyError : modalApiKeyError;
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
}

/**
 * Show error banner with message
 */
function showErrorBanner(message: string) {
  if (errorBanner && errorMessage) {
    errorMessage.textContent = message;
    errorBanner.classList.add('visible');
  }
}

/**
 * Hide error banner
 */
function hideErrorBanner() {
  if (errorBanner) {
    errorBanner.classList.remove('visible');
  }
}

/**
 * Update the extract button state based on settings
 * 
 * In the main view, we only show the extract button when setup is complete,
 * so it should always be enabled. This function is kept for backward compatibility.
 */
async function updateExtractButtonState() {
  // In the new view system, the extract button is only visible in main view
  // which is only shown when setup is complete
  if (extractBtn) {
    // Check if daily limit has been reached (only applies to Ambient AI provider)
    const aiProvider = await getAIProvider();
    const limitReached = aiProvider === 'ambient_ai' && await isDailyExtractLimitReached();
    const limit = await getDailyExtractLimit();
    extractBtn.disabled = limitReached;
    
    if (limitReached) {
      extractBtn.textContent = 'Daily Limit Reached';
      extractBtn.title = `Max limit of ${limit} retrievals per day reached`;
    } else {
      extractBtn.textContent = 'Extract Events';
      extractBtn.title = '';
    }
  }
}

/**
 * Handle when rate limit is reached (either locally or from server)
 * Shows error message in status and disables extract button
 * Shows different message based on whether user has ambient profile
 */
async function handleRateLimitReached() {
  updateStatus('error');
  const isAmbientUser = await getIsAmbientUser();
  const limit = await getDailyExtractLimit();
  
  if (statusEl) {
    if (isAmbientUser) {
      // User has ambient profile - just show limit reached
      statusEl.textContent = `Max limit of ${limit} retrievals per day reached`;
    } else {
      // User doesn't have ambient profile - encourage them to create one
      statusEl.textContent = 'Limit reached, create a profile at tryambientai.com to increase your limit';
    }
    statusEl.className = 'status status-error';
  }
  
  // Disable the extract button
  if (extractBtn) {
    extractBtn.disabled = true;
    extractBtn.textContent = 'Daily Limit Reached';
    extractBtn.title = `Max limit of ${limit} retrievals per day reached`;
  }
  
  if (isAmbientUser) {
    log(`Daily limit of ${limit} extract requests reached. Please try again tomorrow.`);
  } else {
    log(`Daily limit of ${limit} extract requests reached. Create an Ambient profile at tryambientai.com to increase your limit to 10.`);
  }
}

/**
 * Update the ambient profile status display in both get-started view and modal
 */
async function updateAmbientProfileStatus() {
  const isAmbientUser = await getIsAmbientUser();
  
  // Update get-started view profile status
  if (profileStatusIndicator) {
    if (isAmbientUser) {
      profileStatusIndicator.classList.add('connected');
    } else {
      profileStatusIndicator.classList.remove('connected');
    }
  }
  
  if (profileStatusText) {
    profileStatusText.textContent = isAmbientUser ? 'Connected' : 'Not connected';
    if (isAmbientUser) {
      profileStatusText.classList.add('connected');
    } else {
      profileStatusText.classList.remove('connected');
    }
  }
  
  if (profileInfoUnconnected) {
    if (isAmbientUser) {
      profileInfoUnconnected.classList.add('hidden');
    } else {
      profileInfoUnconnected.classList.remove('hidden');
    }
  }
  
  // Update modal profile status
  if (modalProfileStatusIndicator) {
    if (isAmbientUser) {
      modalProfileStatusIndicator.classList.add('connected');
    } else {
      modalProfileStatusIndicator.classList.remove('connected');
    }
  }
  
  if (modalProfileStatusText) {
    modalProfileStatusText.textContent = isAmbientUser ? 'Connected' : 'Not connected';
    if (isAmbientUser) {
      modalProfileStatusText.classList.add('connected');
    } else {
      modalProfileStatusText.classList.remove('connected');
    }
  }
  
  if (modalProfileInfoUnconnected) {
    if (isAmbientUser) {
      modalProfileInfoUnconnected.classList.add('hidden');
    } else {
      modalProfileInfoUnconnected.classList.remove('hidden');
    }
  }
}

/**
 * Handle the Check Connection button click
 * Calls the server to verify if the user has an Ambient profile
 */
async function handleCheckProfile() {
  // Disable both buttons during check
  if (checkProfileBtn) {
    checkProfileBtn.disabled = true;
    checkProfileBtn.classList.add('loading');
    checkProfileBtn.textContent = 'Checking...';
  }
  if (modalCheckProfileBtn) {
    modalCheckProfileBtn.disabled = true;
    modalCheckProfileBtn.classList.add('loading');
    modalCheckProfileBtn.textContent = 'Checking...';
  }
  
  log('Checking Ambient profile connection...');
  
  try {
    // Call background script to check profile
    const result = await chrome.runtime.sendMessage({ type: 'CHECK_PROFILE' });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to check profile');
    }
    
    const { isAmbientUser, email } = result;
    
    // Log the result
    if (isAmbientUser) {
      log(`Profile check: Connected (${email})`);
    } else {
      log(`Profile check: Not connected (${email}) - No matching Ambient profile found`);
    }
    
    // Save the ambient user status
    await saveIsAmbientUser(isAmbientUser);
    
    // Update the UI
    await updateAmbientProfileStatus();
    
    // Also update the extract button state in case limit changed
    await updateExtractButtonState();
    
  } catch (error) {
    const errorMessage = (error as Error).message;
    log(`Profile check failed: ${errorMessage}`);
    
    // If token error, show reconnect message
    if (errorMessage.includes('token') || errorMessage.includes('401')) {
      log('Please reconnect your Google Calendar to check profile status.');
    }
  } finally {
    // Re-enable buttons
    if (checkProfileBtn) {
      checkProfileBtn.disabled = false;
      checkProfileBtn.classList.remove('loading');
      checkProfileBtn.textContent = 'Check Connection';
    }
    if (modalCheckProfileBtn) {
      modalCheckProfileBtn.disabled = false;
      modalCheckProfileBtn.classList.remove('loading');
      modalCheckProfileBtn.textContent = 'Check Connection';
    }
  }
}

// ============ Settings Modal Functions ============

/**
 * Show the settings modal
 */
function showSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Hide the settings modal
 */
function hideSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Handle click on modal overlay (close if clicking outside content)
 */
function handleModalOverlayClick(event: Event) {
  if (event.target === settingsModal) {
    hideSettingsModal();
  }
}

/**
 * Handle saving the user name from modal
 */
async function handleModalSaveUserName() {
  const name = modalUserNameInput?.value?.trim();
  if (!name) {
    log('Please enter your name');
    return;
  }

  try {
    await saveUserName(name);
    log(`User name saved: ${name}`);
    
    // Sync to get started input
    if (userNameInput) {
      userNameInput.value = name;
    }
    
    // Visual feedback
    if (modalSaveNameBtn) {
      const originalText = modalSaveNameBtn.textContent;
      modalSaveNameBtn.textContent = 'Saved!';
      setTimeout(() => {
        if (modalSaveNameBtn) modalSaveNameBtn.textContent = originalText;
      }, 1500);
    }
  } catch (error) {
    log(`Error saving user name: ${(error as Error).message}`);
  }
}

/**
 * Handle saving the API key from modal
 */
async function handleModalSaveApiKey() {
  const key = modalApiKeyInput?.value?.trim();
  if (!key) {
    log('Please enter an API key');
    showApiKeyError('Please enter an API key', 'modal');
    return;
  }

  // Clear any previous errors
  hideApiKeyError('modal');

  try {
    await saveGeminiKey(key);
    
    log('Validating API key...');
    if (modalSaveKeyBtn) modalSaveKeyBtn.textContent = 'Validating...';
    
    const validation = await validateGeminiKey(key);
    
    if (!validation.valid) {
      log(`API key invalid: ${validation.error}`);
      showApiKeyError(validation.error || 'Invalid API key', 'modal');
      if (modalSaveKeyBtn) modalSaveKeyBtn.textContent = 'Save';
      return;
    }
    
    log('API key saved and validated successfully');
    
    // Switch to display mode showing masked key (both views)
    updateApiKeyDisplay(true);
    updateModalApiKeyDisplay(true);
    
    // Visual feedback
    if (modalSaveKeyBtn) {
      modalSaveKeyBtn.textContent = 'Saved!';
      setTimeout(() => {
        if (modalSaveKeyBtn) modalSaveKeyBtn.textContent = 'Save';
      }, 1500);
    }
  } catch (error) {
    log(`Error saving API key: ${(error as Error).message}`);
    showApiKeyError((error as Error).message, 'modal');
    if (modalSaveKeyBtn) modalSaveKeyBtn.textContent = 'Save';
  }
}

/**
 * Handle deleting the API key from modal
 */
async function handleModalDeleteApiKey() {
  try {
    await removeGeminiKey();
    log('API key deleted');
    
    // Switch back to input mode (both views)
    updateApiKeyDisplay(false);
    updateModalApiKeyDisplay(false);
  } catch (error) {
    log(`Error deleting API key: ${(error as Error).message}`);
  }
}

/**
 * Handle Google Calendar connection from modal
 */
async function handleModalCalendarConnect() {
  const status = await getConnectionStatus();
  
  if (status.connected) {
    if (confirm('Disconnect from Google Calendar?')) {
      try {
        await disconnectCalendar();
        log('Calendar disconnected');
        await updateCalendarStatus();
      } catch (error) {
        log(`Error disconnecting: ${(error as Error).message}`);
      }
    }
    return;
  }
  
  try {
    log('Connecting to Google Calendar...');
    if (modalConnectCalendarBtn) modalConnectCalendarBtn.textContent = 'Connecting...';
    
    await getCalendarToken(true);
    
    const calendar = await getPrimaryCalendar();
    if (calendar) {
      log(`Connected to calendar: ${calendar.summary}`);
    } else {
      log('Connected to Google Calendar');
    }
    
    await updateCalendarStatus();
    
  } catch (error) {
    log(`Calendar connection failed: ${(error as Error).message}`);
    await updateCalendarStatus();
  }
}

/**
 * Handle scroll back days input change
 */
async function handleScrollBackDaysChange() {
  const value = parseInt(scrollBackDaysInput?.value || '0', 10);
  const days = Math.max(0, Math.min(365, isNaN(value) ? 0 : value));
  
  // Update the input value to the validated number
  if (scrollBackDaysInput) {
    scrollBackDaysInput.value = days.toString();
  }
  
  try {
    await saveScrollBackDays(days);
    log(`Scroll back days set to: ${days}`);
  } catch (error) {
    log(`Error saving scroll back days: ${(error as Error).message}`);
  }
}

/**
 * Handle debug toggle change
 */
async function handleDebugToggleChange() {
  const enabled = modalDebugToggle?.checked ?? false;
  
  try {
    await saveDebugMode(enabled);
    updateDebugSectionsVisibility(enabled);
    log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    log(`Error saving debug mode: ${(error as Error).message}`);
  }
}

/**
 * Update visibility of debug tools and activity log sections
 */
function updateDebugSectionsVisibility(enabled: boolean) {
  if (debugSection) {
    debugSection.classList.toggle('hidden', !enabled);
  }
  if (logSection) {
    logSection.classList.toggle('hidden', !enabled);
  }
}

/**
 * Reset the view to the default state (only showing Detected Events, Debug Tools, Activity sections)
 */
function resetViewToDefault() {
  // Hide conversation info section
  if (conversationSection) {
    conversationSection.style.display = 'none';
  }
  
  // Hide matched events section
  if (matchedSection) {
    matchedSection.style.display = 'none';
  }
  
  // Reset the results section to show loading state
  if (resultsEl) {
    resultsEl.innerHTML = '<div class="loading-indicator">Loading events...</div>';
  }
  
  // Clear any previous match results display
  if (matchedResultsEl) {
    matchedResultsEl.innerHTML = '<p class="placeholder">Matching against your calendar...</p>';
  }
  
  // Clear edit state from previous extractions
  editedEvents.clear();
  cardsInEditMode.clear();
}

/**
 * Handle the Extract Events button click
 */
async function handleExtractClick() {
  // Get AI provider early for rate limit check
  const aiProvider = await getAIProvider();
  
  try {
    // Check if daily limit has been reached locally (only for Ambient AI provider)
    if (aiProvider === 'ambient_ai' && await isDailyExtractLimitReached()) {
      await handleRateLimitReached();
      return;
    }
    
    // Clear any previous error banner
    hideErrorBanner();
    
    // Reset the view to default state first
    resetViewToDefault();
    
    // Disable button during processing
    if (extractBtn) extractBtn.disabled = true;
    
    updateStatus('parsing');
    log('Parsing conversation from DOM...');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    if (!tab.url?.includes('messages.google.com')) {
      throw new Error('This extension only works at messages.google.com');
    }

    // Check if we're on a conversation page
    const checkResult = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_PAGE' });
    if (!checkResult?.isOnConversation) {
      throw new Error('Please open a specific conversation (not just the message list)');
    }

    // Check if we need to scroll back
    const scrollBackDays = await getScrollBackDays();
    if (scrollBackDays > 0) {
      updateStatus('scrolling');
      log(`Scrolling back ${scrollBackDays} days to load older messages...`);
      
      const scrollResult = await chrome.tabs.sendMessage(tab.id, { 
        type: 'SCROLL_BACK_DAYS', 
        days: scrollBackDays 
      });
      
      if (!scrollResult.success) {
        log(`Scroll warning: ${scrollResult.error}`);
        // Continue with parsing even if scrolling had issues
      } else if (scrollResult.reachedTarget) {
        log(`Successfully loaded messages from ${scrollBackDays} days ago`);
      } else {
        log(`Loaded messages back to: ${scrollResult.oldestMessageDate || 'unknown date'}`);
      }
    }

    // Request DOM parsing from content script
    const parseResult = await chrome.tabs.sendMessage(tab.id, { type: 'PARSE_DOM' });
    
    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    const conversation: ConversationDict = parseResult.conversation;
    lastParsedConversation = conversation;

    // Display conversation info
    displayConversationInfo(conversation);
    
    log(`Parsed conversation: "${conversation.title}"`);
    log(`Found ${conversation.structured_messages.length} messages`);

    // Get API key and user name for LLM (aiProvider already fetched at start)
    const [apiKey, userName] = await Promise.all([
      getGeminiKey(),
      getUserName()
    ]);

    if (!userName) {
      throw new Error('Please enter your name in settings');
    }
    
    // Only require API key if using gemini_key provider
    if (aiProvider === 'gemini_key' && !apiKey) {
      throw new Error('Please configure your Gemini API key in settings');
    }

    // Call LLM for event extraction via background script
    updateStatus('extracting');
    const providerName = aiProvider === 'ambient_ai' ? 'AmbientAI' : 'Gemini';
    log(`Extracting events with ${providerName}... (this may take 10-30 seconds)`);

    const extractResult = await chrome.runtime.sendMessage({
      type: 'EXTRACT_EVENTS',
      conversation,
      apiKey: apiKey || '',
      userName,
      provider: aiProvider
    });

    if (!extractResult.success) {
      // Check if this is a rate limit error from the server (only applies to Ambient AI)
      if (aiProvider === 'ambient_ai' && extractResult.error?.includes('Rate limit exceeded')) {
        // Server says limit reached - sync local count to max
        const currentCount = await getDailyExtractCount();
        const limit = await getDailyExtractLimit();
        if (currentCount < limit) {
          // Local count doesn't match server - user likely tried to reset it
          await setDailyExtractCount(limit);
        }
        await handleRateLimitReached();
        return;
      }
      throw new Error(extractResult.error);
    }
    
    // Save ambient user status from API response (only for Ambient AI provider)
    if (aiProvider === 'ambient_ai' && extractResult.isAmbientUser !== undefined) {
      await saveIsAmbientUser(extractResult.isAmbientUser);
      await updateAmbientProfileStatus();
    }
    
    // Increment local counter on successful extraction (only for Ambient AI provider)
    if (aiProvider === 'ambient_ai') {
      await incrementDailyExtractCount();
    }

    const events: ExtractedEvent[] = extractResult.events;
    lastExtractedEvents = events;
    
    // Also update debug state so debug tools can access extracted events
    debugExtractedEvents = events;
    updateDebugButtonStates();
    
    log(`AI found ${events.length} potential event(s)`);

    // Display the extracted events
    displayExtractedEvents(events);

    // Check if calendar is connected before matching
    const calendarConnected = await isCalendarConnected();
    if (!calendarConnected) {
      log('Calendar not connected - skipping calendar matching');
      updateStatus('complete');
      log('Event extraction complete! Connect Google Calendar to match events.');
      return;
    }

    // Trigger calendar matching
    await handleCalendarMatching(events, apiKey);

  } catch (error) {
    updateStatus('error');
    const errorMsg = (error as Error).message;
    showErrorBanner(`Extraction failed: ${errorMsg}`);
    log(`Error: ${errorMsg}`);
    
    // Clear loading indicator from results section
    if (resultsEl) {
      resultsEl.innerHTML = '<p class="placeholder">Extraction failed. Check the error above for details.</p>';
    }
  } finally {
    // Re-enable button
    await updateExtractButtonState();
  }
}

/**
 * Handle calendar matching after event extraction
 */
async function handleCalendarMatching(events: ExtractedEvent[], apiKey: string | null) {
  try {
    // Filter to only processable events
    const processableEvents = events.filter(
      e => e.event_type === 'full_potential_event_details' || 
           e.event_type === 'incomplete_event_details'
    );

    // Filter to only future events
    const now = new Date();
    const futureEvents = processableEvents.filter(event => {
      const eventDate = getEventDateTime(event);
      return eventDate && eventDate > now;
    });

    log(`Filtered ${processableEvents.length} processable events to ${futureEvents.length} future events`);

    if (futureEvents.length === 0) {
      log('No future events to match against calendar');
      updateStatus('complete');
      if (matchedResultsEl) {
        matchedResultsEl.innerHTML = '<p class="placeholder">No future events to match against calendar.</p>';
      }
      if (matchedSection) {
        matchedSection.style.display = 'block';
      }
      return;
    }

    // Show matched section with loading state
    if (matchedSection) {
      matchedSection.style.display = 'block';
    }
    if (matchedResultsEl) {
      matchedResultsEl.innerHTML = '<div class="match-loading">Matching against your calendar...</div>';
    }

    updateStatus('fetching_calendar');
    log('Fetching calendar events...');

    // Get calendar events for date range based on extracted events
    const dateRange = getDateRangeFromEvents(futureEvents);
    let calendarEvents: CalendarEvent[];
    
    try {
      calendarEvents = await getEventsFromAllCalendars(dateRange.timeMin, dateRange.timeMax);
      log(`Found ${calendarEvents.length} calendar events in date range`);
    } catch (error) {
      log(`Failed to fetch calendar events: ${(error as Error).message}`);
      if (matchedResultsEl) {
        matchedResultsEl.innerHTML = '<p class="placeholder">Failed to fetch calendar events. Please reconnect your calendar.</p>';
      }
      updateStatus('error');
      return;
    }

    updateStatus('matching');
    
    // Get AI provider for matching
    const aiProvider = await getAIProvider();
    const providerName = aiProvider === 'ambient_ai' ? 'AmbientAI' : 'Gemini';
    log(`Matching events with ${providerName}... (this may take 30-60 seconds)`);

    // Call background script to perform matching
    const matchResult = await chrome.runtime.sendMessage({
      type: 'MATCH_EVENTS',
      extractedEvents: futureEvents,
      calendarEvents,
      apiKey: apiKey || '',
      provider: aiProvider
    });

    if (!matchResult.success) {
      throw new Error(matchResult.error);
    }

    const matches: MatchResult[] = matchResult.matches;
    lastMatchResults = matches;
    log(`Matching complete. Found ${matches.length} match result(s)`);

    // Display match results
    displayMatchResults(matches);

    updateStatus('complete');
    log('Calendar matching complete!');

  } catch (error) {
    log(`Matching error: ${(error as Error).message}`);
    if (matchedResultsEl) {
      matchedResultsEl.innerHTML = `<p class="placeholder">Error matching events: ${(error as Error).message}</p>`;
    }
    updateStatus('error');
  }
}

/**
 * Get the start Date from an extracted event
 */
function getEventDateTime(event: ExtractedEvent): Date | null {
  if (event.start?.dateTime) {
    try {
      return new Date(event.start.dateTime);
    } catch {
      return null;
    }
  } else if (event.start?.date) {
    try {
      return new Date(event.start.date + 'T00:00:00');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get date range from extracted events (with buffer)
 */
function getDateRangeFromEvents(events: ExtractedEvent[]): { timeMin: string; timeMax: string } {
  const now = new Date();
  let minDate = new Date(now);
  let maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 60); // Default 60 days ahead

  for (const event of events) {
    if (event.start?.dateTime) {
      const eventDate = new Date(event.start.dateTime);
      if (eventDate > now && eventDate < minDate) minDate = eventDate;
      if (eventDate > maxDate) maxDate = eventDate;
    } else if (event.start?.date) {
      const eventDate = new Date(event.start.date + 'T00:00:00');
      if (eventDate > now && eventDate < minDate) minDate = eventDate;
      if (eventDate > maxDate) maxDate = eventDate;
    }
  }

  // Add buffer
  minDate.setDate(minDate.getDate() - 14);
  maxDate.setDate(maxDate.getDate() + 14);

  // Ensure minDate is not in the past
  if (minDate < now) {
    minDate = now;
  }

  return {
    timeMin: minDate.toISOString(),
    timeMax: maxDate.toISOString(),
  };
}

/**
 * Display conversation info in the UI
 */
function displayConversationInfo(conversation: ConversationDict) {
  if (conversationSection) {
    conversationSection.style.display = 'block';
  }
  if (convTitle) {
    convTitle.textContent = conversation.title || 'Untitled conversation';
  }
  if (convStats) {
    const messageCount = conversation.structured_messages.length;
    const senders = new Set(conversation.structured_messages.map(m => m.sender));
    convStats.textContent = `${messageCount} messages from ${senders.size} participants`;
  }
}

/**
 * Display parsed messages in the results area (for testing)
 */
function displayParsedMessages(conversation: ConversationDict) {
  if (!resultsEl) return;
  
  const messages = conversation.structured_messages;
  
  if (messages.length === 0) {
    resultsEl.innerHTML = '<p class="placeholder">No messages found in this conversation.</p>';
    return;
  }

  // Show first 5 messages as preview
  const preview = messages.slice(0, 5);
  
  resultsEl.innerHTML = `
    <div class="parse-preview">
      <p class="preview-header">Preview (first ${preview.length} of ${messages.length} messages):</p>
      ${preview.map(m => `
        <div class="message-preview">
          <span class="msg-sender">${escapeHtml(m.sender)}</span>
          <span class="msg-text">${escapeHtml(truncate(m.text, 60))}</span>
          <span class="msg-date">${formatDate(m.date)}</span>
        </div>
      `).join('')}
      ${messages.length > 5 ? `<p class="preview-more">...and ${messages.length - 5} more messages</p>` : ''}
    </div>
  `;
}

/**
 * Check if an event is in the future (or has no date)
 */
function isEventInFuture(event: ExtractedEvent): boolean {
  const now = new Date();
  // Set to start of today for date-only comparisons
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (event.start?.dateTime) {
    // Has specific datetime - check if it's after now
    const eventDate = new Date(event.start.dateTime);
    return eventDate >= now;
  } else if (event.start?.date) {
    // Has date only - check if it's today or later
    const eventDate = new Date(event.start.date + 'T00:00:00');
    return eventDate >= today;
  }
  
  // No date specified - include it (could be incomplete event)
  return true;
}

/**
 * Render a single event card as HTML
 */
function renderEventCard(event: ExtractedEvent, isPast: boolean = false): string {
  return `
    <div class="event-card event-type-${event.event_type}${isPast ? ' past-event' : ''}">
      <div class="event-header">
        <span class="event-type-badge ${event.event_type}">${formatEventType(event.event_type)}</span>
        ${event.user_confirmed_attendance ? '<span class="attendance-badge">✓ Attending</span>' : ''}
        ${isPast ? '<span class="past-badge">Past</span>' : ''}
      </div>
      <h3 class="event-summary">${escapeHtml(event.summary || 'Untitled event')}</h3>
      ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ''}
      <div class="event-details">
        ${event.start?.dateTime || event.start?.date ? `
          <p class="event-time">
            <strong>When:</strong> ${formatEventDateTime(event.start, event.end)}
          </p>
        ` : ''}
        ${event.location ? `<p class="event-location"><strong>Where:</strong> ${escapeHtml(event.location)}</p>` : ''}
        ${event.htmlLink ? `<p class="event-link"><a href="${escapeHtml(event.htmlLink)}" target="_blank">View details</a></p>` : ''}
      </div>
    </div>
  `;
}

/**
 * Display extracted events from LLM
 */
function displayExtractedEvents(events: ExtractedEvent[]) {
  if (!resultsEl) return;
  
  // Filter out "not_an_event" entries
  const actionableEvents = events.filter(e => e.event_type !== 'not_an_event');
  const notEventCount = events.length - actionableEvents.length;
  
  // Filter to only future events
  const futureEvents = actionableEvents.filter(isEventInFuture);
  const pastEvents = actionableEvents.filter(e => !isEventInFuture(e));
  
  if (futureEvents.length === 0 && pastEvents.length === 0) {
    resultsEl.innerHTML = `
      <div class="no-events">
        <p class="placeholder">No plannable events found in this conversation.</p>
        ${notEventCount > 0 ? `<p class="info-text">(${notEventCount} message(s) contained no plannable events)</p>` : ''}
      </div>
    `;
    return;
  }

  if (futureEvents.length === 0 && pastEvents.length > 0) {
    // Only past events - show them with a note
    resultsEl.innerHTML = `
      <div class="events-list">
        <p class="events-header">No upcoming events found</p>
        <div class="past-events-section">
          <button id="toggle-past-events" class="toggle-past-btn">Show ${pastEvents.length} past event(s)</button>
          <div id="past-events-container" class="past-events-container" style="display: none;">
            ${pastEvents.map(event => renderEventCard(event, true)).join('')}
          </div>
        </div>
        ${notEventCount > 0 ? `<p class="info-text">(${notEventCount} message(s) contained no plannable events)</p>` : ''}
      </div>
    `;
    setupPastEventsToggle();
    return;
  }

  // Has future events (and possibly past events)
  resultsEl.innerHTML = `
    <div class="events-list">
      <p class="events-header">Found ${futureEvents.length} upcoming event(s):</p>
      ${futureEvents.map(event => renderEventCard(event, false)).join('')}
      ${pastEvents.length > 0 ? `
        <div class="past-events-section">
          <button id="toggle-past-events" class="toggle-past-btn">Show ${pastEvents.length} past event(s)</button>
          <div id="past-events-container" class="past-events-container" style="display: none;">
            ${pastEvents.map(event => renderEventCard(event, true)).join('')}
          </div>
        </div>
      ` : ''}
      ${notEventCount > 0 ? `<p class="info-text">(${notEventCount} message(s) contained no plannable events)</p>` : ''}
    </div>
  `;
  
  if (pastEvents.length > 0) {
    setupPastEventsToggle();
  }
}

/**
 * Setup click handler for past events toggle button
 */
function setupPastEventsToggle() {
  const toggleBtn = document.getElementById('toggle-past-events');
  const container = document.getElementById('past-events-container');
  
  if (toggleBtn && container) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = container.style.display === 'none';
      container.style.display = isHidden ? 'block' : 'none';
      
      // Update button text
      const eventCount = container.querySelectorAll('.event-card').length;
      toggleBtn.textContent = isHidden 
        ? `Hide ${eventCount} past event(s)` 
        : `Show ${eventCount} past event(s)`;
    });
  }
}

/**
 * Format event type for display
 */
function formatEventType(eventType: string): string {
  switch (eventType) {
    case 'full_potential_event_details':
      return 'Event';
    case 'incomplete_event_details':
      return 'Incomplete';
    case 'not_a_desired_event':
      return 'Declined';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

/**
 * Format event date/time for display
 */
function formatEventDateTime(start?: { date?: string; dateTime?: string }, end?: { date?: string; dateTime?: string }): string {
  if (!start) return 'Time TBD';
  
  try {
    if (start.dateTime) {
      const startDate = new Date(start.dateTime);
      const options: Intl.DateTimeFormatOptions = { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      };
      let result = startDate.toLocaleDateString('en-US', options);
      
      if (end?.dateTime) {
        const endDate = new Date(end.dateTime);
        const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        result += ` - ${endTime}`;
      }
      return result;
    } else if (start.date) {
      const startDate = new Date(start.date + 'T00:00:00');
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
      let result = startDate.toLocaleDateString('en-US', options);
      
      if (end?.date && end.date !== start.date) {
        const endDate = new Date(end.date + 'T00:00:00');
        result += ` - ${endDate.toLocaleDateString('en-US', options)}`;
      }
      return result;
    }
  } catch (e) {
    console.error('Error formatting date:', e);
  }
  
  return start.dateTime || start.date || 'Time TBD';
}

/**
 * Display match results in the matched events section
 */
function displayMatchResults(matches: MatchResult[]) {
  if (!matchedResultsEl) return;

  if (matches.length === 0) {
    matchedResultsEl.innerHTML = '<p class="placeholder">No events to match against calendar.</p>';
    return;
  }

  // Group by match type for summary
  const byType = {
    no_match: matches.filter(m => m.match_type === 'no_match'),
    no_update: matches.filter(m => m.match_type === 'no_update'),
    certain_update: matches.filter(m => m.match_type === 'certain_update'),
    possible_update: matches.filter(m => m.match_type === 'possible_update'),
  };

  let html = '<div class="match-results-list">';

  // New events (no_match)
  if (byType.no_match.length > 0) {
    html += `<div class="match-section-header-row">
      <p class="match-section-header">New Events (${byType.no_match.length})</p>
      ${byType.no_match.length > 1 ? `<button class="add-all-btn" data-action="add-all" data-match-type="no_match">Add All to Calendar</button>` : ''}
    </div>`;
    byType.no_match.forEach((match, idx) => {
      html += renderMatchCard(match, `no_match_${idx}`);
    });
  }

  // Events needing updates (certain_update)
  if (byType.certain_update.length > 0) {
    html += `<div class="match-section-header-row">
      <p class="match-section-header">Events to Update (${byType.certain_update.length})</p>
      ${byType.certain_update.length > 1 ? `<button class="add-all-btn" data-action="add-all" data-match-type="certain_update">Update All</button>` : ''}
    </div>`;
    byType.certain_update.forEach((match, idx) => {
      html += renderMatchCard(match, `certain_update_${idx}`);
    });
  }

  // Possible updates
  if (byType.possible_update.length > 0) {
    html += `<p class="match-section-header">Review Needed (${byType.possible_update.length})</p>`;
    byType.possible_update.forEach((match, idx) => {
      html += renderMatchCard(match, `possible_update_${idx}`);
    });
  }

  // Already in calendar (no_update)
  if (byType.no_update.length > 0) {
    html += `<p class="match-section-header">Already in Calendar (${byType.no_update.length})</p>`;
    byType.no_update.forEach((match, idx) => {
      html += renderMatchCard(match, `no_update_${idx}`);
    });
  }

  html += '</div>';
  matchedResultsEl.innerHTML = html;

  // Set up event listeners for action buttons
  setupMatchActionListeners();
}

/**
 * Render a single match card with editable fields
 */
function renderMatchCard(match: MatchResult, cardId: string): string {
  const event = match.extracted_event;
  const matchType = match.match_type;
  const calEvent = match.matched_calendar_event;
  
  // Get edited values if they exist, otherwise use original event values
  const editedData = editedEvents.get(cardId);
  const summary = editedData?.summary ?? event.summary ?? '';
  const description = editedData?.description ?? event.description ?? '';
  const location = editedData?.location ?? event.location ?? '';
  const start = editedData?.start ?? event.start;
  const end = editedData?.end ?? event.end;
  
  // Determine if this is an all-day event
  const isAllDay = !!(start?.date && !start?.dateTime);
  
  // Format dates for input fields
  const startInputValue = formatDateForInput(start, isAllDay);
  const endInputValue = formatDateForInput(end, isAllDay);
  
  // Determine if this is an update type (show changes by default, hide edit fields)
  const isUpdateType = matchType === 'certain_update' || matchType === 'possible_update';

  let html = `<div class="match-card match-${matchType}${isUpdateType ? ' update-type' : ''}" data-card-id="${cardId}">`;
  
  // Header with badge and edit toggle
  html += `<div class="match-header">`;
  html += `<span class="match-type-badge ${matchType}">${formatMatchType(matchType)}</span>`;
  if (matchType !== 'no_update') {
    html += `<button class="edit-toggle-btn" data-card-id="${cardId}" data-action="toggle-edit">Edit</button>`;
  }
  html += `</div>`;

  // For update types, show summary outside edit fields (always visible)
  if (isUpdateType) {
    html += `<h3 class="match-summary">${escapeHtml(summary)}</h3>`;
  }

  // Editable fields section (hidden by default for update types)
  html += `<div class="edit-fields${isUpdateType ? ' hidden' : ''}" data-card-id="${cardId}">`;
  
  // Summary field
  html += `<div class="edit-field-row">`;
  html += `<label class="edit-label">Title</label>`;
  html += `<input type="text" class="edit-input" data-field="summary" data-card-id="${cardId}" value="${escapeHtml(summary)}" readonly>`;
  html += `</div>`;
  
  // Description field
  html += `<div class="edit-field-row">`;
  html += `<label class="edit-label">Description</label>`;
  html += `<textarea class="edit-textarea" data-field="description" data-card-id="${cardId}" rows="2" readonly>${escapeHtml(description)}</textarea>`;
  html += `</div>`;
  
  // Location field
  html += `<div class="edit-field-row">`;
  html += `<label class="edit-label">Location</label>`;
  html += `<input type="text" class="edit-input" data-field="location" data-card-id="${cardId}" value="${escapeHtml(location)}" readonly>`;
  html += `</div>`;
  
  // All-day checkbox
  html += `<div class="edit-field-row edit-checkbox-row">`;
  html += `<label class="edit-label">All-day event</label>`;
  html += `<input type="checkbox" class="edit-checkbox" data-field="allDay" data-card-id="${cardId}" ${isAllDay ? 'checked' : ''} disabled>`;
  html += `</div>`;
  
  // Start date/time field
  html += `<div class="edit-field-row">`;
  html += `<label class="edit-label">Start</label>`;
  html += `<input type="${isAllDay ? 'date' : 'datetime-local'}" class="edit-input edit-date-input" data-field="start" data-card-id="${cardId}" value="${startInputValue}" readonly>`;
  html += `<span class="validation-error" data-error-for="start" data-card-id="${cardId}"></span>`;
  html += `</div>`;
  
  // End date/time field
  html += `<div class="edit-field-row">`;
  html += `<label class="edit-label">End</label>`;
  html += `<input type="${isAllDay ? 'date' : 'datetime-local'}" class="edit-input edit-date-input" data-field="end" data-card-id="${cardId}" value="${endInputValue}" readonly>`;
  html += `<span class="validation-error" data-error-for="end" data-card-id="${cardId}"></span>`;
  html += `</div>`;
  
  html += `</div>`; // end edit-fields

  // Show matched calendar event info for updates
  if (calEvent && (matchType === 'no_update' || matchType === 'certain_update' || matchType === 'possible_update')) {
    html += `<div class="match-details match-info">`;
    html += `<p><strong>Matched to:</strong> ${escapeHtml(calEvent.summary || 'Untitled')}</p>`;
    if (calEvent.htmlLink) {
      html += `<a href="${escapeHtml(calEvent.htmlLink)}" target="_blank" class="match-calendar-link">View in Calendar</a>`;
    }
    html += `</div>`;
  }

  // Show field differences for updates (collapsed when in edit mode)
  if (match.field_differences && hasDifferences(match.field_differences)) {
    html += `<div class="field-diff-container" data-card-id="${cardId}">`;
    html += renderFieldDifferences(match.field_differences);
    html += `</div>`;
  }

  // Action buttons
  html += `<div class="match-actions" data-card-id="${cardId}">`;
  
  if (matchType === 'no_match') {
    html += `<button class="action-btn add-btn" data-action="add" data-card-id="${cardId}">Add to Calendar</button>`;
  } else if (matchType === 'certain_update') {
    html += `<button class="action-btn update-btn" data-action="update" data-card-id="${cardId}">Update</button>`;
    html += `<button class="action-btn skip-btn" data-action="skip" data-card-id="${cardId}">Skip</button>`;
  } else if (matchType === 'possible_update') {
    html += `<button class="action-btn review-btn" data-action="update" data-card-id="${cardId}">Update</button>`;
    html += `<button class="action-btn skip-btn" data-action="skip" data-card-id="${cardId}">Skip</button>`;
  }
  // no_update doesn't need action buttons
  
  html += `</div>`;
  html += `</div>`;

  return html;
}

/**
 * Format a DateTimeInfo object for use in an input field
 */
function formatDateForInput(dateInfo: DateTimeInfo | undefined, isAllDay: boolean): string {
  if (!dateInfo) return '';
  
  if (isAllDay && dateInfo.date) {
    // All-day event: use YYYY-MM-DD format
    return dateInfo.date;
  } else if (dateInfo.dateTime) {
    // Timed event: convert ISO to datetime-local format (YYYY-MM-DDTHH:mm)
    try {
      const date = new Date(dateInfo.dateTime);
      // Format as local datetime for the input
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  } else if (dateInfo.date) {
    // Has date but treating as timed - add default time
    return `${dateInfo.date}T12:00`;
  }
  
  return '';
}

/**
 * Convert input field value back to DateTimeInfo
 */
function parseInputToDateTimeInfo(inputValue: string, isAllDay: boolean): DateTimeInfo | undefined {
  if (!inputValue) return undefined;
  
  if (isAllDay) {
    // Validate YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
      return { date: inputValue };
    }
    return undefined;
  } else {
    // datetime-local format: YYYY-MM-DDTHH:mm
    try {
      const date = new Date(inputValue);
      if (isNaN(date.getTime())) return undefined;
      
      // Convert to ISO string with timezone
      return { 
        dateTime: date.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    } catch {
      return undefined;
    }
  }
}

/**
 * Validate a single date input field
 */
function validateDateInput(inputValue: string, isAllDay: boolean, fieldName: string): { valid: boolean; error?: string } {
  if (!inputValue) {
    return { valid: false, error: `${fieldName} is required` };
  }
  
  if (isAllDay) {
    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
      return { valid: false, error: 'Invalid date format (expected YYYY-MM-DD)' };
    }
    // Check if the date is actually valid
    const parts = inputValue.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return { valid: false, error: 'Invalid date' };
    }
  } else {
    // datetime-local format: YYYY-MM-DDTHH:mm
    try {
      const date = new Date(inputValue);
      if (isNaN(date.getTime())) {
        return { valid: false, error: 'Invalid date/time' };
      }
    } catch {
      return { valid: false, error: 'Invalid date/time format' };
    }
  }
  
  return { valid: true };
}

/**
 * Validate all event fields for a card
 */
function validateEventFields(cardId: string): ValidationResult {
  const errors: { field: string; message: string }[] = [];
  
  // Get the card element
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) {
    return { isValid: false, errors: [{ field: 'card', message: 'Card not found' }] };
  }
  
  // Get field values
  const summaryInput = card.querySelector(`input[data-field="summary"]`) as HTMLInputElement;
  const startInput = card.querySelector(`input[data-field="start"]`) as HTMLInputElement;
  const endInput = card.querySelector(`input[data-field="end"]`) as HTMLInputElement;
  const allDayCheckbox = card.querySelector(`input[data-field="allDay"]`) as HTMLInputElement;
  
  // Validate summary (required)
  if (!summaryInput?.value?.trim()) {
    errors.push({ field: 'summary', message: 'Title is required' });
  }
  
  const isAllDay = allDayCheckbox?.checked ?? false;
  
  // Validate start date
  if (startInput?.value) {
    const startValidation = validateDateInput(startInput.value, isAllDay, 'Start');
    if (!startValidation.valid) {
      errors.push({ field: 'start', message: startValidation.error || 'Invalid start date' });
    }
  } else {
    errors.push({ field: 'start', message: 'Start date is required' });
  }
  
  // Validate end date
  if (endInput?.value) {
    const endValidation = validateDateInput(endInput.value, isAllDay, 'End');
    if (!endValidation.valid) {
      errors.push({ field: 'end', message: endValidation.error || 'Invalid end date' });
    }
  }
  
  // Validate end is after start (if both are present and valid)
  if (startInput?.value && endInput?.value && errors.length === 0) {
    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      if (endDate < startDate) {
        errors.push({ field: 'end', message: 'End must be after start' });
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Display validation errors on the card
 */
function displayValidationErrors(cardId: string, errors: { field: string; message: string }[]) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  // Clear all previous errors
  card.querySelectorAll('.validation-error').forEach(el => {
    el.textContent = '';
  });
  card.querySelectorAll('.edit-input.error, .edit-textarea.error').forEach(el => {
    el.classList.remove('error');
  });
  
  // Display new errors
  for (const error of errors) {
    const errorEl = card.querySelector(`.validation-error[data-error-for="${error.field}"]`);
    if (errorEl) {
      errorEl.textContent = error.message;
    }
    
    // Add error class to input
    const input = card.querySelector(`[data-field="${error.field}"]`);
    if (input) {
      input.classList.add('error');
    }
  }
}

/**
 * Clear validation errors from a card
 */
function clearValidationErrors(cardId: string) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  card.querySelectorAll('.validation-error').forEach(el => {
    el.textContent = '';
  });
  card.querySelectorAll('.edit-input.error, .edit-textarea.error').forEach(el => {
    el.classList.remove('error');
  });
}

/**
 * Render field differences for display
 */
function renderFieldDifferences(diffs: FieldDifferences): string {
  let html = '<div class="field-diff">';
  html += '<p class="field-diff-header">Changes:</p>';

  if (diffs.summary) {
    html += `<div class="diff-row">
      <span class="diff-label">Title:</span>
      <span class="diff-old">${escapeHtml(diffs.summary.old)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${escapeHtml(diffs.summary.new)}</span>
    </div>`;
  }

  if (diffs.description) {
    const oldDesc = truncate(diffs.description.old, 50);
    const newDesc = truncate(diffs.description.new, 50);
    html += `<div class="diff-row">
      <span class="diff-label">Description:</span>
      <span class="diff-old">${escapeHtml(oldDesc)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${escapeHtml(newDesc)}</span>
    </div>`;
  }

  if (diffs.location) {
    html += `<div class="diff-row">
      <span class="diff-label">Location:</span>
      <span class="diff-old">${escapeHtml(diffs.location.old)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${escapeHtml(diffs.location.new)}</span>
    </div>`;
  }

  if (diffs.start) {
    html += `<div class="diff-row">
      <span class="diff-label">Start:</span>
      <span class="diff-old">${formatDateTimeForDisplay(diffs.start.old)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${formatDateTimeForDisplay(diffs.start.new)}</span>
    </div>`;
  }

  if (diffs.end) {
    html += `<div class="diff-row">
      <span class="diff-label">End:</span>
      <span class="diff-old">${formatDateTimeForDisplay(diffs.end.old)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${formatDateTimeForDisplay(diffs.end.new)}</span>
    </div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Format match type for display
 */
function formatMatchType(matchType: string): string {
  switch (matchType) {
    case 'no_match':
      return 'New Event';
    case 'no_update':
      return 'In Calendar';
    case 'certain_update':
      return 'Update Available';
    case 'possible_update':
      return 'Review';
    default:
      return matchType.replace(/_/g, ' ');
  }
}

/**
 * Set up event listeners for match action buttons
 */
function setupMatchActionListeners() {
  const actionButtons = document.querySelectorAll('.match-actions .action-btn');
  
  console.log('[Ambient] setupMatchActionListeners: found', actionButtons.length, 'action buttons');
  log(`Setting up ${actionButtons.length} action button listeners`);
  
  actionButtons.forEach((btn, idx) => {
    console.log(`[Ambient] Attaching listener to button ${idx}:`, btn.textContent, 'data-action:', (btn as HTMLButtonElement).dataset.action);
    btn.addEventListener('click', handleMatchAction);
  });
  
  // Set up "Add All" / "Update All" bulk action buttons
  const addAllButtons = document.querySelectorAll('.add-all-btn');
  addAllButtons.forEach(btn => {
    btn.addEventListener('click', handleAddAllToCalendar);
  });
  
  // Set up edit toggle buttons
  const editToggleButtons = document.querySelectorAll('.edit-toggle-btn');
  editToggleButtons.forEach(btn => {
    btn.addEventListener('click', handleEditToggle);
  });
  
  // Set up input change handlers for all editable fields
  setupEditFieldListeners();
}

/**
 * Set up listeners for all editable fields
 */
function setupEditFieldListeners() {
  // Text inputs and textareas
  const editInputs = document.querySelectorAll('.edit-input, .edit-textarea');
  editInputs.forEach(input => {
    input.addEventListener('change', handleFieldChange);
    input.addEventListener('blur', handleFieldBlur);
  });
  
  // All-day checkbox
  const allDayCheckboxes = document.querySelectorAll('.edit-checkbox[data-field="allDay"]');
  allDayCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleAllDayToggle);
  });
}

/**
 * Handle edit toggle button click
 */
function handleEditToggle(event: Event) {
  const btn = event.target as HTMLButtonElement;
  const cardId = btn.dataset.cardId;
  if (!cardId) return;
  
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  const isCurrentlyEditing = cardsInEditMode.has(cardId);
  const isUpdateType = card.classList.contains('update-type');
  
  if (isCurrentlyEditing) {
    // Exit edit mode - validate first
    const validation = validateEventFields(cardId);
    if (!validation.isValid) {
      displayValidationErrors(cardId, validation.errors);
      return;
    }
    
    // Save edited values and exit edit mode
    saveCardEdits(cardId);
    exitEditMode(cardId);
    btn.textContent = 'Edit';
    
    // For update types, recalculate and update the changes section
    if (isUpdateType) {
      updateChangesSection(cardId);
    }
  } else {
    // Enter edit mode
    enterEditMode(cardId);
    btn.textContent = 'Done';
  }
}

/**
 * Update the changes section with edited values for update type cards
 */
function updateChangesSection(cardId: string) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  // Get the match result for this card
  const matchResult = getMatchResultByCardId(cardId);
  if (!matchResult || !matchResult.matched_calendar_event) return;
  
  const calEvent = matchResult.matched_calendar_event;
  const editedData = editedEvents.get(cardId);
  
  // Use edited values or fall back to extracted event values
  const newSummary = editedData?.summary ?? matchResult.extracted_event.summary ?? '';
  const newDescription = editedData?.description ?? matchResult.extracted_event.description ?? '';
  const newLocation = editedData?.location ?? matchResult.extracted_event.location ?? '';
  const newStart = editedData?.start ?? matchResult.extracted_event.start;
  const newEnd = editedData?.end ?? matchResult.extracted_event.end;
  
  // Calculate new field differences
  const newDiffs: FieldDifferences = {};
  
  if (newSummary !== (calEvent.summary ?? '')) {
    newDiffs.summary = { old: calEvent.summary ?? '', new: newSummary };
  }
  
  if (newDescription !== (calEvent.description ?? '')) {
    newDiffs.description = { old: calEvent.description ?? '', new: newDescription };
  }
  
  if (newLocation !== (calEvent.location ?? '')) {
    newDiffs.location = { old: calEvent.location ?? '', new: newLocation };
  }
  
  // Compare start dates
  if (newStart && calEvent.start) {
    const calStartStr = calEvent.start.dateTime || calEvent.start.date || '';
    const newStartStr = newStart.dateTime || newStart.date || '';
    if (calStartStr !== newStartStr) {
      newDiffs.start = { old: calEvent.start, new: newStart };
    }
  } else if (newStart && !calEvent.start) {
    newDiffs.start = { old: {}, new: newStart };
  }
  
  // Compare end dates
  if (newEnd && calEvent.end) {
    const calEndStr = calEvent.end.dateTime || calEvent.end.date || '';
    const newEndStr = newEnd.dateTime || newEnd.date || '';
    if (calEndStr !== newEndStr) {
      newDiffs.end = { old: calEvent.end, new: newEnd };
    }
  } else if (newEnd && !calEvent.end) {
    newDiffs.end = { old: {}, new: newEnd };
  }
  
  // Update the field-diff-container
  const diffContainer = card.querySelector('.field-diff-container');
  if (diffContainer) {
    if (hasDifferences(newDiffs)) {
      diffContainer.innerHTML = renderFieldDifferences(newDiffs);
    } else {
      diffContainer.innerHTML = '<div class="field-diff"><p class="field-diff-header">No changes</p></div>';
    }
  }
  
  // Also update the summary heading if it exists
  const summaryHeading = card.querySelector(':scope > .match-summary');
  if (summaryHeading) {
    summaryHeading.textContent = newSummary;
  }
}

/**
 * Get a MatchResult by card ID
 */
function getMatchResultByCardId(cardId: string): MatchResult | undefined {
  if (!lastMatchResults) return undefined;
  
  // Parse cardId format: "no_match_0", "certain_update_1", etc.
  const lastUnderscoreIdx = cardId.lastIndexOf('_');
  const index = parseInt(cardId.substring(lastUnderscoreIdx + 1), 10);
  
  if (cardId.startsWith('no_match_')) {
    return lastMatchResults.filter(m => m.match_type === 'no_match')[index];
  } else if (cardId.startsWith('certain_update_')) {
    return lastMatchResults.filter(m => m.match_type === 'certain_update')[index];
  } else if (cardId.startsWith('possible_update_')) {
    return lastMatchResults.filter(m => m.match_type === 'possible_update')[index];
  } else if (cardId.startsWith('no_update_')) {
    return lastMatchResults.filter(m => m.match_type === 'no_update')[index];
  }
  
  return undefined;
}

/**
 * Enter edit mode for a card
 */
function enterEditMode(cardId: string) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  cardsInEditMode.add(cardId);
  card.classList.add('editing');
  
  const isUpdateType = card.classList.contains('update-type');
  
  // For update types, show the edit fields section
  if (isUpdateType) {
    const editFields = card.querySelector('.edit-fields');
    if (editFields) {
      editFields.classList.remove('hidden');
    }
  }
  
  // Enable all input fields
  card.querySelectorAll('.edit-input, .edit-textarea').forEach(el => {
    (el as HTMLInputElement | HTMLTextAreaElement).readOnly = false;
  });
  
  // Enable checkbox
  card.querySelectorAll('.edit-checkbox').forEach(el => {
    (el as HTMLInputElement).disabled = false;
  });
  
  // Hide field differences when editing
  const diffContainer = card.querySelector('.field-diff-container');
  if (diffContainer) {
    (diffContainer as HTMLElement).style.display = 'none';
  }
  
  log(`Editing event: ${cardId}`);
}

/**
 * Exit edit mode for a card
 */
function exitEditMode(cardId: string) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  cardsInEditMode.delete(cardId);
  card.classList.remove('editing');
  
  const isUpdateType = card.classList.contains('update-type');
  
  // For update types, hide the edit fields section again
  if (isUpdateType) {
    const editFields = card.querySelector('.edit-fields');
    if (editFields) {
      editFields.classList.add('hidden');
    }
  }
  
  // Make all input fields read-only
  card.querySelectorAll('.edit-input, .edit-textarea').forEach(el => {
    (el as HTMLInputElement | HTMLTextAreaElement).readOnly = true;
  });
  
  // Disable checkbox
  card.querySelectorAll('.edit-checkbox').forEach(el => {
    (el as HTMLInputElement).disabled = true;
  });
  
  // Show field differences again
  const diffContainer = card.querySelector('.field-diff-container');
  if (diffContainer) {
    (diffContainer as HTMLElement).style.display = 'block';
  }
  
  // Clear validation errors
  clearValidationErrors(cardId);
  
  log(`Finished editing: ${cardId}`);
}

/**
 * Save the edited values for a card
 */
function saveCardEdits(cardId: string) {
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  const summaryInput = card.querySelector('input[data-field="summary"]') as HTMLInputElement;
  const descriptionInput = card.querySelector('textarea[data-field="description"]') as HTMLTextAreaElement;
  const locationInput = card.querySelector('input[data-field="location"]') as HTMLInputElement;
  const startInput = card.querySelector('input[data-field="start"]') as HTMLInputElement;
  const endInput = card.querySelector('input[data-field="end"]') as HTMLInputElement;
  const allDayCheckbox = card.querySelector('input[data-field="allDay"]') as HTMLInputElement;
  
  const isAllDay = allDayCheckbox?.checked ?? false;
  
  const editedEvent: Partial<CalendarEvent> = {
    summary: summaryInput?.value || '',
    description: descriptionInput?.value || '',
    location: locationInput?.value || '',
    start: parseInputToDateTimeInfo(startInput?.value || '', isAllDay),
    end: parseInputToDateTimeInfo(endInput?.value || '', isAllDay),
  };
  
  editedEvents.set(cardId, editedEvent);
  console.log('[Ambient] Saved edits for card:', cardId, editedEvent);
}

/**
 * Handle field change event
 */
function handleFieldChange(event: Event) {
  const input = event.target as HTMLInputElement | HTMLTextAreaElement;
  const cardId = input.dataset.cardId;
  const field = input.dataset.field;
  
  if (!cardId || !field) return;
  
  // Only process if in edit mode
  if (!cardsInEditMode.has(cardId)) return;
  
  // Validate date fields on change
  if (field === 'start' || field === 'end') {
    const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
    const allDayCheckbox = card?.querySelector('input[data-field="allDay"]') as HTMLInputElement;
    const isAllDay = allDayCheckbox?.checked ?? false;
    
    const validation = validateDateInput(input.value, isAllDay, field === 'start' ? 'Start' : 'End');
    
    if (!validation.valid) {
      input.classList.add('error');
      const errorEl = card?.querySelector(`.validation-error[data-error-for="${field}"]`);
      if (errorEl) errorEl.textContent = validation.error || 'Invalid';
    } else {
      input.classList.remove('error');
      const errorEl = card?.querySelector(`.validation-error[data-error-for="${field}"]`);
      if (errorEl) errorEl.textContent = '';
    }
  }
}

/**
 * Handle field blur event (save intermediate values)
 */
function handleFieldBlur(event: Event) {
  const input = event.target as HTMLInputElement | HTMLTextAreaElement;
  const cardId = input.dataset.cardId;
  
  if (!cardId || !cardsInEditMode.has(cardId)) return;
  
  // Auto-save on blur
  saveCardEdits(cardId);
}

/**
 * Handle all-day checkbox toggle
 */
function handleAllDayToggle(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const cardId = checkbox.dataset.cardId;
  if (!cardId) return;
  
  const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
  if (!card) return;
  
  const isAllDay = checkbox.checked;
  
  // Update the input types for start and end
  const startInput = card.querySelector('input[data-field="start"]') as HTMLInputElement;
  const endInput = card.querySelector('input[data-field="end"]') as HTMLInputElement;
  
  if (startInput) {
    const currentValue = startInput.value;
    startInput.type = isAllDay ? 'date' : 'datetime-local';
    
    // Try to preserve the date part
    if (currentValue) {
      if (isAllDay) {
        // Extract just the date
        startInput.value = currentValue.split('T')[0];
      } else {
        // Add a default time
        if (!currentValue.includes('T')) {
          startInput.value = `${currentValue}T12:00`;
        }
      }
    }
  }
  
  if (endInput) {
    const currentValue = endInput.value;
    endInput.type = isAllDay ? 'date' : 'datetime-local';
    
    if (currentValue) {
      if (isAllDay) {
        endInput.value = currentValue.split('T')[0];
      } else {
        if (!currentValue.includes('T')) {
          endInput.value = `${currentValue}T13:00`;
        }
      }
    }
  }
  
  // Save the changes
  saveCardEdits(cardId);
}

/**
 * Handle match action button click
 */
async function handleMatchAction(event: Event) {
  console.log('[Ambient] handleMatchAction triggered!', event);
  log('Action button clicked');
  
  const btn = event.target as HTMLButtonElement;
  const action = btn.dataset.action;
  const cardId = btn.dataset.cardId;

  console.log('[Ambient] Button details - action:', action, 'cardId:', cardId);
  console.log('[Ambient] lastMatchResults available:', !!lastMatchResults, 'count:', lastMatchResults?.length);

  if (!action || !cardId || !lastMatchResults) {
    console.log('[Ambient] Missing data - action:', action, 'cardId:', cardId, 'results:', !!lastMatchResults);
    log(`Error: Missing data for action (action=${action}, cardId=${cardId}, results=${!!lastMatchResults})`);
    return;
  }

  // Find the match result
  // cardId format is like "no_match_0", "certain_update_1", etc.
  // Extract the index from the last part after the last underscore
  const lastUnderscoreIdx = cardId.lastIndexOf('_');
  const index = parseInt(cardId.substring(lastUnderscoreIdx + 1), 10);
  
  console.log('[Ambient] Parsed cardId:', cardId, '-> index:', index);
  
  let matchResult: MatchResult | undefined;
  
  if (cardId.startsWith('no_match_')) {
    const filtered = lastMatchResults.filter(m => m.match_type === 'no_match');
    console.log('[Ambient] no_match results:', filtered.length, 'looking for index:', index);
    matchResult = filtered[index];
  } else if (cardId.startsWith('certain_update_')) {
    const filtered = lastMatchResults.filter(m => m.match_type === 'certain_update');
    console.log('[Ambient] certain_update results:', filtered.length, 'looking for index:', index);
    matchResult = filtered[index];
  } else if (cardId.startsWith('possible_update_')) {
    const filtered = lastMatchResults.filter(m => m.match_type === 'possible_update');
    console.log('[Ambient] possible_update results:', filtered.length, 'looking for index:', index);
    matchResult = filtered[index];
  } else if (cardId.startsWith('no_update_')) {
    const filtered = lastMatchResults.filter(m => m.match_type === 'no_update');
    console.log('[Ambient] no_update results:', filtered.length, 'looking for index:', index);
    matchResult = filtered[index];
  }

  if (!matchResult) {
    console.log('[Ambient] Could not find match result for cardId:', cardId);
    log(`Could not find match result for ${cardId}`);
    return;
  }
  
  console.log('[Ambient] Found match result:', matchResult.extracted_event.summary);

  // Disable the button
  btn.disabled = true;
  btn.textContent = action === 'skip' ? 'Skipping...' : 'Processing...';

  try {
    if (action === 'add') {
      await handleAddToCalendar(matchResult, btn);
    } else if (action === 'update') {
      await handleUpdateCalendar(matchResult, btn);
    } else if (action === 'skip') {
      handleSkipMatch(btn);
    }
  } catch (error) {
    log(`Action failed: ${(error as Error).message}`);
    btn.disabled = false;
    btn.textContent = action === 'add' ? 'Add to Calendar' : 'Update';
  }
}

/**
 * Handle adding a new event to calendar
 */
async function handleAddToCalendar(match: MatchResult, btn: HTMLButtonElement) {
  const event = match.extracted_event;
  const cardId = btn.dataset.cardId;
  
  // Get edited values if they exist
  const editedData = cardId ? editedEvents.get(cardId) : null;
  
  console.log('[Ambient] handleAddToCalendar called for:', event.summary);
  console.log('[Ambient] Edited data available:', !!editedData);
  log(`Adding event to calendar: ${editedData?.summary || event.summary}`);

  // Validate if in edit mode
  if (cardId && cardsInEditMode.has(cardId)) {
    const validation = validateEventFields(cardId);
    if (!validation.isValid) {
      displayValidationErrors(cardId, validation.errors);
      log('Validation failed - please fix errors before adding');
      return;
    }
    // Save edits before proceeding
    saveCardEdits(cardId);
  }

  // Show spinner on button
  const originalContent = btn.innerHTML;
  btn.innerHTML = '<span class="btn-spinner"></span> Adding...';
  btn.classList.add('loading');

  // Create the calendar event - merge edited values with original
  const finalEditedData = cardId ? editedEvents.get(cardId) : null;
  const newEvent: Partial<CalendarEvent> = {
    summary: finalEditedData?.summary ?? event.summary,
    description: finalEditedData?.description ?? event.description,
    location: finalEditedData?.location ?? event.location,
    start: finalEditedData?.start ?? event.start,
    end: finalEditedData?.end ?? event.end ?? event.start, // Default end to start if not set
  };

  console.log('[Ambient] Event data to create:', JSON.stringify(newEvent, null, 2));
  log(`Event data: summary="${newEvent.summary}", start=${JSON.stringify(newEvent.start)}`);

  try {
    // Get or create the ambient calendar
    console.log('[Ambient] Getting or creating ambient calendar...');
    const ambientCalendarId = await getOrCreateAmbientCalendar();
    console.log('[Ambient] Using ambient calendar:', ambientCalendarId);
    
    console.log('[Ambient] Calling createEvent...');
    const createdEvent = await createEvent(newEvent, ambientCalendarId);
    console.log('[Ambient] createEvent returned:', createdEvent);
    log(`Event created successfully: ${createdEvent.summary}`);
    
    // Clean up edited data
    if (cardId) {
      editedEvents.delete(cardId);
      cardsInEditMode.delete(cardId);
    }
    
    // Update UI
    const card = btn.closest('.match-card');
    if (card) {
      const actionsDiv = card.querySelector('.match-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = `<div class="action-success">Added to calendar</div>`;
      }
      // Remove editing state
      card.classList.remove('editing');
    }
  } catch (error) {
    console.error('[Ambient] createEvent error:', error);
    log(`Error creating event: ${(error as Error).message}`);
    
    // Restore button on error
    btn.innerHTML = originalContent;
    btn.classList.remove('loading');
    btn.disabled = false;
    
    // Show error in UI
    const card = btn.closest('.match-card');
    if (card) {
      const actionsDiv = card.querySelector('.match-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = `
          <div class="action-error">Failed: ${escapeHtml((error as Error).message)}</div>
          <button class="action-btn add-btn" data-action="add" data-card-id="${btn.dataset.cardId}">Retry</button>
        `;
        // Re-attach listener
        const retryBtn = actionsDiv.querySelector('.add-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', handleMatchAction);
        }
      }
    }
    
    throw error;
  }
}

/**
 * Handle updating an existing calendar event
 */
async function handleUpdateCalendar(match: MatchResult, btn: HTMLButtonElement) {
  const calEvent = match.matched_calendar_event;
  const cardId = btn.dataset.cardId;

  if (!calEvent?.id) {
    throw new Error('No calendar event ID to update');
  }

  // Get edited values if they exist
  const editedData = cardId ? editedEvents.get(cardId) : null;

  // Validate if in edit mode
  if (cardId && cardsInEditMode.has(cardId)) {
    const validation = validateEventFields(cardId);
    if (!validation.isValid) {
      displayValidationErrors(cardId, validation.errors);
      log('Validation failed - please fix errors before updating');
      return;
    }
    // Save edits before proceeding
    saveCardEdits(cardId);
  }

  // Merge edited values with suggested updates
  const finalEditedData = cardId ? editedEvents.get(cardId) : null;
  const updates: Partial<CalendarEvent> = {
    ...match.suggested_updates,
    ...(finalEditedData?.summary !== undefined && { summary: finalEditedData.summary }),
    ...(finalEditedData?.description !== undefined && { description: finalEditedData.description }),
    ...(finalEditedData?.location !== undefined && { location: finalEditedData.location }),
    ...(finalEditedData?.start !== undefined && { start: finalEditedData.start }),
    ...(finalEditedData?.end !== undefined && { end: finalEditedData.end }),
  };

  log(`Updating calendar event: ${calEvent.summary}`);
  console.log('[Ambient] Updates to apply:', JSON.stringify(updates, null, 2));

  try {
    // Use the calendar ID from the matched event, fallback to 'primary' if not available
    const calendarId = calEvent.calendarName || 'primary';
    console.log('[Ambient] Updating event on calendar:', calendarId);
    
    const updatedEvent = await updateEvent(calEvent.id, updates, calendarId);
    log(`Event updated: ${updatedEvent.summary}`);
    
    // Clean up edited data
    if (cardId) {
      editedEvents.delete(cardId);
      cardsInEditMode.delete(cardId);
    }
    
    // Update UI
    const card = btn.closest('.match-card');
    if (card) {
      const actionsDiv = card.querySelector('.match-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = `<div class="action-success">Calendar updated</div>`;
      }
      // Remove editing state
      card.classList.remove('editing');
    }
  } catch (error) {
    throw new Error(`Failed to update event: ${(error as Error).message}`);
  }
}

/**
 * Handle skipping a match
 */
function handleSkipMatch(btn: HTMLButtonElement) {
  const card = btn.closest('.match-card');
  if (card) {
    const actionsDiv = card.querySelector('.match-actions');
    if (actionsDiv) {
      actionsDiv.innerHTML = `<div class="action-success" style="color: #5f6368;">Skipped</div>`;
    }
  }
}

/**
 * Handle "Add All to Calendar" or "Update All" button click
 */
async function handleAddAllToCalendar(event: Event) {
  const btn = event.target as HTMLButtonElement;
  const matchType = btn.dataset.matchType;
  
  if (!matchType || !lastMatchResults) {
    log('Error: Missing match type or results');
    return;
  }
  
  // Get all matches of this type
  const matchesToProcess = lastMatchResults.filter(m => m.match_type === matchType);
  
  if (matchesToProcess.length === 0) {
    log('No events to process');
    return;
  }
  
  // Disable the button and show progress
  btn.disabled = true;
  const originalText = btn.textContent || '';
  btn.innerHTML = `<span class="btn-spinner"></span> Processing...`;
  btn.classList.add('loading');
  
  let successCount = 0;
  let errorCount = 0;
  
  log(`Processing ${matchesToProcess.length} events...`);
  
  for (let idx = 0; idx < matchesToProcess.length; idx++) {
    const match = matchesToProcess[idx];
    const cardId = `${matchType}_${idx}`;
    const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
    
    // Skip if already processed (check if action buttons are gone)
    if (card) {
      const actionsDiv = card.querySelector('.match-actions');
      const hasActionBtn = actionsDiv?.querySelector('.action-btn:not(:disabled)');
      if (!hasActionBtn) {
        // Already processed
        continue;
      }
    }
    
    try {
      if (matchType === 'no_match') {
        // Add new event
        await addEventToCalendarBulk(match, cardId);
        successCount++;
      } else if (matchType === 'certain_update') {
        // Update existing event
        await updateEventInCalendarBulk(match, cardId);
        successCount++;
      }
      
      // Update the card UI to show success
      if (card) {
        const actionsDiv = card.querySelector('.match-actions');
        if (actionsDiv) {
          const successMsg = matchType === 'no_match' ? 'Added to calendar' : 'Calendar updated';
          actionsDiv.innerHTML = `<div class="action-success">${successMsg}</div>`;
        }
        card.classList.remove('editing');
      }
    } catch (error) {
      errorCount++;
      log(`Error processing event ${idx + 1}: ${(error as Error).message}`);
      
      // Show error on the card
      if (card) {
        const actionsDiv = card.querySelector('.match-actions');
        if (actionsDiv) {
          actionsDiv.innerHTML = `<div class="action-error">Failed: ${escapeHtml((error as Error).message)}</div>`;
        }
      }
    }
  }
  
  // Update button state
  if (successCount > 0 && errorCount === 0) {
    btn.innerHTML = '✓ All Done';
    btn.classList.remove('loading');
    btn.classList.add('completed');
  } else if (errorCount > 0) {
    btn.textContent = `${successCount} added, ${errorCount} failed`;
    btn.classList.remove('loading');
    btn.disabled = false;
  } else {
    btn.textContent = originalText;
    btn.classList.remove('loading');
    btn.disabled = false;
  }
  
  log(`Bulk operation complete: ${successCount} succeeded, ${errorCount} failed`);
}

/**
 * Add a single event to calendar (bulk operation helper)
 */
async function addEventToCalendarBulk(match: MatchResult, cardId: string): Promise<void> {
  const event = match.extracted_event;
  
  // Get edited values if they exist
  const editedData = editedEvents.get(cardId);
  
  // Create the calendar event - merge edited values with original
  const newEvent: Partial<CalendarEvent> = {
    summary: editedData?.summary ?? event.summary,
    description: editedData?.description ?? event.description,
    location: editedData?.location ?? event.location,
    start: editedData?.start ?? event.start,
    end: editedData?.end ?? event.end ?? event.start,
  };
  
  // Get or create the ambient calendar
  const ambientCalendarId = await getOrCreateAmbientCalendar();
  
  // Create the event
  await createEvent(newEvent, ambientCalendarId);
  
  // Clean up edited data
  editedEvents.delete(cardId);
  cardsInEditMode.delete(cardId);
}

/**
 * Update a single event in calendar (bulk operation helper)
 */
async function updateEventInCalendarBulk(match: MatchResult, cardId: string): Promise<void> {
  const calEvent = match.matched_calendar_event;
  
  if (!calEvent?.id) {
    throw new Error('No calendar event ID to update');
  }
  
  // Get edited values if they exist
  const editedData = editedEvents.get(cardId);
  
  // Merge edited values with suggested updates
  const updates: Partial<CalendarEvent> = {
    ...match.suggested_updates,
    ...(editedData?.summary !== undefined && { summary: editedData.summary }),
    ...(editedData?.description !== undefined && { description: editedData.description }),
    ...(editedData?.location !== undefined && { location: editedData.location }),
    ...(editedData?.start !== undefined && { start: editedData.start }),
    ...(editedData?.end !== undefined && { end: editedData.end }),
  };
  
  // Update the event - use the calendar ID from the matched event
  const calendarId = calEvent.calendarName || 'primary';
  await updateEvent(calEvent.id, updates, calendarId);
  
  // Clean up edited data
  editedEvents.delete(cardId);
  cardsInEditMode.delete(cardId);
}

/**
 * Display extracted event matches (for future use)
 */
function displayResults(matches: MatchResult[]) {
  const container = resultsEl;
  if (!container) return;
  
  container.innerHTML = '';
  
  if (matches.length === 0) {
    container.innerHTML = '<p class="placeholder">No events found in this conversation.</p>';
    return;
  }

  matches.forEach((match) => {
    const eventEl = document.createElement('div');
    eventEl.className = `event-card match-${match.match_type}`;
    eventEl.innerHTML = `
      <h3>${escapeHtml(match.extracted_event.summary)}</h3>
      <p class="match-type">${match.match_type.replace(/_/g, ' ')}</p>
      ${match.extracted_event.start?.dateTime || match.extracted_event.start?.date 
        ? `<p class="event-time">${match.extracted_event.start.dateTime || match.extracted_event.start.date}</p>` 
        : ''}
      ${match.extracted_event.location 
        ? `<p class="event-location">${escapeHtml(match.extracted_event.location)}</p>` 
        : ''}
    `;
    container.appendChild(eventEl);
  });
}

/**
 * Update the status display
 */
function updateStatus(status: ExtensionStatus) {
  currentStatus = status;
  if (statusEl) {
    const statusLabels: Record<ExtensionStatus, string> = {
      idle: 'Ready',
      parsing: 'Parsing messages...',
      scrolling: 'Loading more messages...',
      extracting: 'Extracting events...',
      fetching_calendar: 'Fetching calendar...',
      matching: 'Matching events...',
      updating: 'Updating calendar...',
      complete: 'Complete',
      error: 'Error'
    };
    statusEl.textContent = statusLabels[status];
    statusEl.className = `status status-${status}`;
  }
}

/**
 * Log a message to the activity log
 */
function log(message: string) {
  console.log('[Ambient]', message);
  if (logEl) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// Utility functions
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return isoDate;
  }
}

// ============ Debug Functions ============

/**
 * Update debug button states based on available data
 */
function updateDebugButtonStates() {
  // Conversation prompt button - enabled when conversation exists
  if (debugConvPromptBtn) {
    debugConvPromptBtn.disabled = !debugConversation;
  }
  
  // Update event selector dropdown
  if (debugEventSelect) {
    // Clear existing options
    debugEventSelect.innerHTML = '';
    
    if (debugExtractedEvents && debugExtractedEvents.length > 0) {
      // Populate with events
      debugExtractedEvents.forEach((event, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        // Create a display name from summary or fallback
        const displayName = event.summary || `Event ${index + 1}`;
        // Truncate if too long
        option.textContent = displayName.length > 40 
          ? displayName.substring(0, 37) + '...' 
          : displayName;
        option.title = displayName; // Full name on hover
        debugEventSelect!.appendChild(option);
      });
      debugEventSelect.disabled = false;
    } else {
      // No events - show placeholder
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No events loaded';
      debugEventSelect.appendChild(option);
      debugEventSelect.disabled = true;
    }
  }
  
  // Match prompt button - enabled when both events and calendar input exist
  if (debugMatchPromptBtn) {
    debugMatchPromptBtn.disabled = !debugExtractedEvents || !debugCalendarInput;
  }
  
  // Show events input section when conversation exists but events don't
  if (debugEventsSection) {
    debugEventsSection.style.display = debugConversation ? 'block' : 'none';
  }
}

/**
 * Set debug output content
 */
function setDebugOutput(content: string, isError: boolean = false) {
  if (debugOutput) {
    debugOutput.textContent = content;
    debugOutput.style.color = isError ? '#f44336' : '#d4d4d4';
  }
}

/**
 * Handle Inspect DOM button - shows diagnostic info about the page structure
 */
async function handleDebugDomInfo() {
  try {
    setDebugOutput('Inspecting DOM...');
    log('[Debug] Inspecting DOM structure...');
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    if (!tab.url?.includes('messages.google.com')) {
      throw new Error('Please open a Google Messages page first');
    }

    // Request DOM debug info from content script
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'DEBUG_DOM' });
    
    if (!result.success) {
      throw new Error(result.error);
    }

    const jsonOutput = JSON.stringify(result.debug, null, 2);
    setDebugOutput(jsonOutput);
    log('[Debug] DOM inspection complete');
    
  } catch (error) {
    setDebugOutput(`Error: ${(error as Error).message}`, true);
    log(`[Debug] Error: ${(error as Error).message}`);
  }
}

/**
 * Handle Get Conversation JSON button
 */
async function handleDebugGetConversation() {
  try {
    setDebugOutput('Fetching conversation from DOM...');
    log('[Debug] Getting conversation JSON...');
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    if (!tab.url?.includes('messages.google.com')) {
      throw new Error('Please open a Google Messages conversation first');
    }

    // Check if we're on a conversation page
    const checkResult = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_PAGE' });
    if (!checkResult?.isOnConversation) {
      throw new Error('Please open a specific conversation (not just the message list)');
    }

    // Request DOM parsing from content script
    const parseResult = await chrome.tabs.sendMessage(tab.id, { type: 'PARSE_DOM' });
    
    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    debugConversation = parseResult.conversation;
    const jsonOutput = JSON.stringify(debugConversation, null, 2);
    
    setDebugOutput(jsonOutput);
    log(`[Debug] Conversation loaded: ${debugConversation?.title} (${debugConversation?.structured_messages.length} messages)`);
    
    updateDebugButtonStates();
    
  } catch (error) {
    setDebugOutput(`Error: ${(error as Error).message}`, true);
    log(`[Debug] Error: ${(error as Error).message}`);
  }
}

/**
 * Handle Create Conversation Prompt button
 */
async function handleDebugConversationPrompt() {
  try {
    if (!debugConversation) {
      throw new Error('No conversation loaded. Click "Get Conversation JSON" first.');
    }
    
    setDebugOutput('Generating conversation prompt...');
    log('[Debug] Creating conversation prompt...');
    
    // Get user name for prompt
    const userName = await getUserName() || 'User';
    
    // Generate the prompt
    const prompt = generateEventExtractionPrompt(debugConversation, userName);
    
    setDebugOutput(prompt);
    log(`[Debug] Conversation prompt generated (${prompt.length} chars)`);
    
  } catch (error) {
    setDebugOutput(`Error: ${(error as Error).message}`, true);
    log(`[Debug] Error: ${(error as Error).message}`);
  }
}

/**
 * Handle Create Calendar Input button
 * 
 * Uses the same logic as the real matching flow:
 * - Calculates date range from extracted events (if available)
 * - Fetches from ALL calendars, not just primary
 */
async function handleDebugCalendarInput() {
  try {
    setDebugOutput('Fetching calendar events...');
    log('[Debug] Getting calendar input...');
    
    // Check if calendar is connected
    const status = await getConnectionStatus();
    if (!status.connected) {
      throw new Error('Calendar not connected. Please connect Google Calendar first.');
    }
    
    // Calculate date range - use extracted events if available (same as real flow)
    let timeMin: string;
    let timeMax: string;
    
    if (debugExtractedEvents && debugExtractedEvents.length > 0) {
      // Filter to future events only (same as handleCalendarMatching)
      const now = new Date();
      const futureEvents = debugExtractedEvents.filter(event => {
        const eventDate = getEventDateTime(event);
        return eventDate && eventDate > now;
      });
      
      if (futureEvents.length > 0) {
        const dateRange = getDateRangeFromEvents(futureEvents);
        timeMin = dateRange.timeMin;
        timeMax = dateRange.timeMax;
        log(`[Debug] Using date range from ${futureEvents.length} extracted events`);
      } else {
        // No future events - use default 2 year range
        const defaultRange = getDateRange(7, 730);
        timeMin = defaultRange.timeMin;
        timeMax = defaultRange.timeMax;
        log('[Debug] No future extracted events, using default 2-year range');
      }
    } else {
      // No extracted events - use default 2 year range to cover most scenarios
      const defaultRange = getDateRange(7, 730);
      timeMin = defaultRange.timeMin;
      timeMax = defaultRange.timeMax;
      log('[Debug] No extracted events loaded, using default 2-year range');
    }
    
    log(`[Debug] Date range: ${timeMin} to ${timeMax}`);
    
    // Fetch from ALL calendars (same as real flow)
    const events = await getEventsFromAllCalendars(timeMin, timeMax);
    
    debugCalendarInput = events;
    const jsonOutput = JSON.stringify(debugCalendarInput, null, 2);
    
    setDebugOutput(jsonOutput);
    log(`[Debug] Calendar input loaded: ${events.length} events from all calendars`);
    
    updateDebugButtonStates();
    
  } catch (error) {
    setDebugOutput(`Error: ${(error as Error).message}`, true);
    log(`[Debug] Error: ${(error as Error).message}`);
  }
}

/**
 * Handle Load Events button (manual JSON input)
 */
function handleDebugLoadEvents() {
  try {
    const jsonText = debugEventsJson?.value?.trim();
    if (!jsonText) {
      throw new Error('Please paste extracted events JSON in the textarea');
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Accept both array and single object
    if (Array.isArray(parsed)) {
      debugExtractedEvents = parsed;
    } else {
      debugExtractedEvents = [parsed];
    }
    
    setDebugOutput(`Loaded ${debugExtractedEvents.length} event(s) from JSON input`);
    log(`[Debug] Loaded ${debugExtractedEvents.length} extracted event(s)`);
    
    updateDebugButtonStates();
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      setDebugOutput('Error: Invalid JSON format', true);
    } else {
      setDebugOutput(`Error: ${(error as Error).message}`, true);
    }
    log(`[Debug] Error loading events: ${(error as Error).message}`);
  }
}

/**
 * Handle Create Match Prompt button
 */
async function handleDebugMatchPrompt() {
  try {
    if (!debugExtractedEvents || debugExtractedEvents.length === 0) {
      throw new Error('No extracted events. Load events from JSON or run extraction first.');
    }
    
    if (!debugCalendarInput) {
      throw new Error('No calendar input. Click "Create Calendar Input" first.');
    }
    
    // Get the selected event index from the dropdown
    const selectedIndex = debugEventSelect?.value ? parseInt(debugEventSelect.value, 10) : 0;
    
    if (selectedIndex < 0 || selectedIndex >= debugExtractedEvents.length) {
      throw new Error('Invalid event selection.');
    }
    
    const selectedEvent = debugExtractedEvents[selectedIndex];
    
    setDebugOutput('Generating match prompt...');
    log(`[Debug] Creating match prompt for event ${selectedIndex + 1} of ${debugExtractedEvents.length}...`);
    
    const prompt = generateMatchInstructions(selectedEvent, debugCalendarInput);
    
    setDebugOutput(prompt);
    log(`[Debug] Match prompt generated for event: ${selectedEvent.summary || 'Untitled'}`);
    
  } catch (error) {
    setDebugOutput(`Error: ${(error as Error).message}`, true);
    log(`[Debug] Error: ${(error as Error).message}`);
  }
}

// =========================================
//  FILE IMPORT FLOW
// =========================================

function importLog(message: string) {
  if (importLogEl) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const now = new Date().toLocaleTimeString();
    entry.textContent = `[${now}] ${message}`;
    importLogEl.appendChild(entry);
    importLogEl.scrollTop = importLogEl.scrollHeight;
  }
  console.log(`[Import] ${message}`);
}

function updateImportStatus(status: ExtensionStatus) {
  if (!importStatusEl) return;
  importStatusEl.className = `status status-${status}`;
  const labels: Record<string, string> = {
    idle: 'Ready',
    extracting: 'Extracting...',
    fetching_calendar: 'Fetching calendar...',
    matching: 'Matching...',
    complete: 'Complete',
    error: 'Error',
  };
  importStatusEl.textContent = labels[status] || status;
}

function showImportErrorBanner(message: string) {
  if (importErrorBanner && importErrorMessage) {
    importErrorMessage.textContent = message;
    importErrorBanner.classList.add('visible');
  }
}

function hideImportErrorBanner() {
  if (importErrorBanner) {
    importErrorBanner.classList.remove('visible');
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  fileDropzone?.classList.add('dragover');
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  fileDropzone?.classList.remove('dragover');
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  fileDropzone?.classList.remove('dragover');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    setSelectedFile(files[0]);
  }
}

function handleFileSelect() {
  const files = fileInput?.files;
  if (files && files.length > 0) {
    setSelectedFile(files[0]);
  }
}

function setSelectedFile(file: File) {
  selectedFile = file;
  if (fileDropzone) fileDropzone.style.display = 'none';
  if (fileSelected) fileSelected.style.display = 'flex';
  if (fileNameEl) fileNameEl.textContent = file.name;
  if (importExtractBtn) importExtractBtn.disabled = false;
}

function handleFileRemove() {
  selectedFile = null;
  if (fileDropzone) fileDropzone.style.display = 'flex';
  if (fileSelected) fileSelected.style.display = 'none';
  if (fileInput) fileInput.value = '';
  if (importExtractBtn) importExtractBtn.disabled = true;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function handleImportExtractClick() {
  if (!selectedFile) return;

  const aiProvider = await getAIProvider();

  try {
    if (aiProvider === 'ambient_ai' && await isDailyExtractLimitReached()) {
      showImportErrorBanner('Daily extraction limit reached. Please try again tomorrow or switch to your own Gemini API key.');
      return;
    }

    hideImportErrorBanner();

    // Reset import results
    if (importResultsEl) {
      importResultsEl.innerHTML = '<p class="placeholder"><span class="btn-spinner"></span> Extracting events from file...</p>';
    }
    if (importMatchedSection) importMatchedSection.style.display = 'none';

    if (importExtractBtn) importExtractBtn.disabled = true;
    updateImportStatus('extracting');
    importLog(`Reading file: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`);

    const fileBase64 = await readFileAsBase64(selectedFile);
    const mimeType = selectedFile.type || 'application/octet-stream';

    const [apiKey] = await Promise.all([getGeminiKey()]);

    if (aiProvider === 'gemini_key' && !apiKey) {
      throw new Error('Please configure your Gemini API key in settings');
    }

    const providerName = aiProvider === 'ambient_ai' ? 'AmbientAI' : 'Gemini';
    importLog(`Extracting events with ${providerName}... (this may take 10-30 seconds)`);

    const extractResult = await chrome.runtime.sendMessage({
      type: 'EXTRACT_FROM_FILE',
      fileBase64,
      mimeType,
      fileName: selectedFile.name,
      apiKey: apiKey || '',
      provider: aiProvider,
    });

    if (!extractResult.success) {
      if (aiProvider === 'ambient_ai' && extractResult.error?.includes('Rate limit exceeded')) {
        const currentCount = await getDailyExtractCount();
        const limit = await getDailyExtractLimit();
        if (currentCount < limit) {
          await setDailyExtractCount(limit);
        }
        showImportErrorBanner('Daily extraction limit reached.');
        updateImportStatus('error');
        return;
      }
      throw new Error(extractResult.error);
    }

    if (aiProvider === 'ambient_ai' && extractResult.isAmbientUser !== undefined) {
      await saveIsAmbientUser(extractResult.isAmbientUser);
    }

    if (aiProvider === 'ambient_ai') {
      await incrementDailyExtractCount();
    }

    const events: ExtractedEvent[] = extractResult.events;
    lastExtractedEvents = events;
    importLog(`AI found ${events.length} event(s) in file`);

    displayImportedEvents(events);

    const calendarConnected = await isCalendarConnected();
    if (!calendarConnected) {
      importLog('Calendar not connected - skipping calendar matching');
      updateImportStatus('complete');
      return;
    }

    await handleImportCalendarMatching(events, apiKey);

  } catch (error) {
    updateImportStatus('error');
    const errorMsg = (error as Error).message;
    showImportErrorBanner(`Extraction failed: ${errorMsg}`);
    importLog(`Error: ${errorMsg}`);
    if (importResultsEl) {
      importResultsEl.innerHTML = '<p class="placeholder">Extraction failed. Check the error above for details.</p>';
    }
  } finally {
    if (importExtractBtn && selectedFile) importExtractBtn.disabled = false;
  }
}

function displayImportedEvents(events: ExtractedEvent[]) {
  if (!importResultsEl) return;

  const actionableEvents = events.filter(e => e.event_type !== 'not_an_event');

  if (actionableEvents.length === 0) {
    importResultsEl.innerHTML = '<p class="placeholder">No events found in the uploaded file.</p>';
    return;
  }

  importResultsEl.innerHTML = `
    <div class="events-list">
      <p class="events-header">Found ${actionableEvents.length} event(s) in file:</p>
      ${actionableEvents.map(event => renderEventCard(event, false)).join('')}
    </div>
  `;
}

async function handleImportCalendarMatching(events: ExtractedEvent[], apiKey: string | null) {
  try {
    const processableEvents = events.filter(
      e => e.event_type === 'full_potential_event_details' ||
           e.event_type === 'incomplete_event_details'
    );

    if (processableEvents.length === 0) {
      importLog('No processable events to match');
      updateImportStatus('complete');
      return;
    }

    if (importMatchedSection) importMatchedSection.style.display = 'block';
    if (importMatchedResultsEl) {
      importMatchedResultsEl.innerHTML = '<p class="placeholder"><span class="btn-spinner"></span> Matching against your calendar...</p>';
    }

    updateImportStatus('fetching_calendar');
    importLog('Fetching calendar events for matching...');

    const dateRange = getDateRangeFromEvents(processableEvents);
    const calendarEvents = await getEventsFromAllCalendars(dateRange.timeMin, dateRange.timeMax);
    importLog(`Fetched ${calendarEvents.length} calendar events for comparison`);

    updateImportStatus('matching');
    const aiProvider = await getAIProvider();
    const providerName = aiProvider === 'ambient_ai' ? 'AmbientAI' : 'Gemini';
    importLog(`Matching events with ${providerName}...`);

    const matchResult = await chrome.runtime.sendMessage({
      type: 'MATCH_EVENTS',
      extractedEvents: processableEvents,
      calendarEvents,
      apiKey: apiKey || '',
      provider: aiProvider,
    });

    if (!matchResult.success) {
      throw new Error(matchResult.error);
    }

    const matches: MatchResult[] = matchResult.matches;
    lastMatchResults = matches;

    importLog(`Matching complete: ${matches.length} result(s)`);
    displayImportMatchResults(matches);
    updateImportStatus('complete');
    importLog('Import complete!');

  } catch (error) {
    updateImportStatus('error');
    const errorMsg = (error as Error).message;
    showImportErrorBanner(`Matching failed: ${errorMsg}`);
    importLog(`Matching error: ${errorMsg}`);
  }
}

function displayImportMatchResults(matches: MatchResult[]) {
  // Reuse the same rendering as the main view but target the import containers
  const origMatchedResults = matchedResultsEl;
  const origMatchedSection = matchedSection;

  matchedResultsEl = importMatchedResultsEl;
  matchedSection = importMatchedSection;

  displayMatchResults(matches);

  matchedResultsEl = origMatchedResults;
  matchedSection = origMatchedSection;
}
