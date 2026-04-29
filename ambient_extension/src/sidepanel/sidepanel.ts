/**
 * Side panel UI controller
 * Handles settings, status display, and event extraction workflow
 */

import type { ExtensionStatus, ExtractedEvent, MatchResult, ConversationDict, CalendarEvent, FieldDifferences, DateTimeInfo, EventCategory, ConversationListItem } from '../types';
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
  saveAdditionalConversations,
  getAdditionalConversations,
  saveDebugMode,
  getDebugMode,
  getDailyExtractCount,
  incrementDailyExtractCount,
  setDailyExtractCount,
  isDailyExtractLimitReached,
  getDailyExtractLimit,
  saveIsAmbientUser,
  getIsAmbientUser,
  saveSelectedCalendarId,
  getSelectedCalendarId,
  upsertCreatedTrip,
  getCreatedTrips,
  removeCreatedTrip,
  findCreatedTripByConversationTitle,
  DAILY_EXTRACT_LIMIT,
  type AIProvider,
  type CreatedTripEntry,
} from '../lib/storage';
import {
  getCalendarToken,
  disconnectCalendar,
  getConnectionStatus
} from '../lib/calendarAuth';
import { getPrimaryCalendar, getEvents, getEventsFromAllCalendars, getDateRange, createEvent, updateEvent, getOrCreateAmbientCalendar, listCalendars, createCalendar } from '../lib/calendarApi';
import { generateEventExtractionPrompt } from '../llm/extraction';
import { generateMatchInstructions } from '../llm/matching';
import { formatDateTimeForDisplay, hasDifferences } from '../llm/matching';
import { TabTracker } from '../lib/tabTracker';

const SUPPORTED_PLATFORM_HOSTS = ['messages.google.com', 'www.messenger.com'];

function isSupportedPlatformUrl(url: string | undefined): boolean {
  if (!url) return false;
  return SUPPORTED_PLATFORM_HOSTS.some(host => url.includes(host));
}

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

// Paused Overlay / New Window Tip Elements
let pausedOverlay: HTMLElement | null;
let pausedTabNameEl: HTMLElement | null;
let switchBackBtn: HTMLElement | null;
let openNewWindowBtn: HTMLElement | null;

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

// Scroll Back Days / Additional Conversations UI Elements
let scrollBackDaysInput: HTMLInputElement | null;
let additionalConversationsInput: HTMLInputElement | null;

// Multi-conversation UI Elements
let multiProgressSection: HTMLElement | null;
let multiProgressStatus: HTMLElement | null;
let multiProgressBar: HTMLElement | null;
let multiResultsSection: HTMLElement | null;
let multiResultsContainer: HTMLElement | null;
let singleResultsSection: HTMLElement | null;

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

// Calendar Agent View Elements
let agentView: HTMLElement | null;
let agentBackBtn: HTMLElement | null;
let agentStartBtn: HTMLButtonElement | null;
let agentStopBtn: HTMLButtonElement | null;
let agentStatusEl: HTMLElement | null;
let agentPhaseEl: HTMLElement | null;
let agentIterationEl: HTMLElement | null;
let agentProgressSection: HTMLElement | null;
let agentEventsCountEl: HTMLElement | null;
let agentDateRangeEl: HTMLElement | null;
let agentPlanStepsEl: HTMLElement | null;
let agentUnknownPlatformNotice: HTMLElement | null;
let agentResultsSection: HTMLElement | null;
let agentResultsList: HTMLElement | null;
let modeWebpageBtn: HTMLElement | null;

// Calendar Agent State
let agentRunning = false;
let agentPageUrl: string | null = null;
let agentPageUrlSubmitted = false;

// Import State
let selectedFile: File | null = null;

// State
let currentStatus: ExtensionStatus = 'idle';
let lastParsedConversation: ConversationDict | null = null;
let lastExtractedEvents: ExtractedEvent[] | null = null;
let lastMatchResults: MatchResult[] | null = null;

// Multi-conversation state
interface ConversationResult {
  conversation: ConversationDict;
  extractedEvents: ExtractedEvent[] | null;
  matchResults: MatchResult[] | null;
  status: 'pending' | 'extracting' | 'matching' | 'complete' | 'error';
  error?: string;
}
let multiConversationResults: ConversationResult[] = [];

// Filter State
let filterCategories: EventCategory[] = [];
let activeFilterIds: Set<string> = new Set();
let filterEventsSource: ExtractedEvent[] = [];

// Debug State
let debugConversation: ConversationDict | null = null;
let debugExtractedEvents: ExtractedEvent[] | null = null;
let debugCalendarInput: CalendarEvent[] | null = null;

// Edit State - stores user modifications to match cards
let editedEvents: Map<string, Partial<CalendarEvent>> = new Map();
let cardsInEditMode: Set<string> = new Set();

// Tab tracking
const tabTracker = new TabTracker({
  onPaused(tabTitle: string) {
    log(`Extraction paused — switched away from "${tabTitle}". Switch back to continue.`);
    showPausedOverlay(tabTitle);
  },
  onResumed() {
    log('Extraction resumed — tab is active again.');
    hidePausedOverlay();
  },
  onTabClosed() {
    log('Tracked Google Messages tab was closed.');
    hidePausedOverlay();
    showErrorBanner('The Google Messages tab was closed. Please reopen it and try again.');
  },
});

function showPausedOverlay(tabTitle: string) {
  if (pausedOverlay) pausedOverlay.classList.add('active');
  if (pausedTabNameEl) pausedTabNameEl.textContent = tabTitle ? `Tab: ${tabTitle}` : '';
}

function hidePausedOverlay() {
  if (pausedOverlay) pausedOverlay.classList.remove('active');
}

// Calendar selection state - which calendar to add new events to
let selectedCalendarId: string | null = null;

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

  // Paused overlay / new window tip elements
  pausedOverlay = document.getElementById('paused-overlay');
  pausedTabNameEl = document.getElementById('paused-tab-name');
  switchBackBtn = document.getElementById('switch-back-btn');
  openNewWindowBtn = document.getElementById('open-new-window-btn');

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

  // Scroll back days / additional conversations inputs
  scrollBackDaysInput = document.getElementById('scroll-back-days') as HTMLInputElement;
  additionalConversationsInput = document.getElementById('additional-conversations') as HTMLInputElement;

  // Multi-conversation UI
  multiProgressSection = document.getElementById('multi-progress-section');
  multiProgressStatus = document.getElementById('multi-progress-status');
  multiProgressBar = document.getElementById('multi-progress-bar');
  multiResultsSection = document.getElementById('multi-results-section');
  multiResultsContainer = document.getElementById('multi-results-container');
  singleResultsSection = document.getElementById('single-results-section');

  // Mode Selection View elements
  modeSelectView = document.getElementById('mode-select-view');
  modeMessagesBtn = document.getElementById('mode-messages-btn');
  modeImportBtn = document.getElementById('mode-import-btn');
  modeSettingsBtn = document.getElementById('mode-settings-btn');
  modeWebpageBtn = document.getElementById('mode-webpage-btn');

  // Calendar Agent View elements
  agentView = document.getElementById('agent-view');
  agentBackBtn = document.getElementById('agent-back-btn');
  agentStartBtn = document.getElementById('agent-start-btn') as HTMLButtonElement;
  agentStopBtn = document.getElementById('agent-stop-btn') as HTMLButtonElement;
  agentStatusEl = document.getElementById('agent-status');
  agentPhaseEl = document.getElementById('agent-phase');
  agentIterationEl = document.getElementById('agent-iteration');
  agentProgressSection = document.getElementById('agent-progress-section');
  agentEventsCountEl = document.getElementById('agent-events-count');
  agentDateRangeEl = document.getElementById('agent-date-range');
  agentPlanStepsEl = document.getElementById('agent-plan-steps');
  agentUnknownPlatformNotice = document.getElementById('agent-unknown-platform-notice');
  agentResultsSection = document.getElementById('agent-results-section');
  agentResultsList = document.getElementById('agent-results-list');

  // Import View elements
  importView = document.getElementById('import-view');
  importBackBtn = document.getElementById('import-back-btn');
  importSettingsBtn = document.getElementById('import-settings-btn');
  importExtractBtn = document.getElementById('import-extract-btn') as HTMLButtonElement;
  importStatusEl = document.getElementById('import-status');
  importResultsEl = document.getElementById('import-results');
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

  // Paused overlay / new window tip listeners
  switchBackBtn?.addEventListener('click', () => tabTracker.switchToTrackedTab());
  openNewWindowBtn?.addEventListener('click', () => {
    chrome.windows.create({ url: 'about:blank', focused: true });
  });

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

  // Scroll back days / additional conversations event listeners
  scrollBackDaysInput?.addEventListener('change', handleScrollBackDaysChange);
  additionalConversationsInput?.addEventListener('change', handleAdditionalConversationsChange);

  // Debug toggle event listener
  modalDebugToggle?.addEventListener('change', handleDebugToggleChange);

  // Mode selection listeners
  modeMessagesBtn?.addEventListener('click', () => showView('main'));
  modeImportBtn?.addEventListener('click', () => showView('import'));
  modeWebpageBtn?.addEventListener('click', () => {
    showView('agent');
    handleAgentStart();
  });
  modeSettingsBtn?.addEventListener('click', showSettingsModal);
  mainBackBtn?.addEventListener('click', () => showView('mode-select'));

  // Calendar Agent view listeners
  agentBackBtn?.addEventListener('click', () => showView('mode-select'));
  agentStartBtn?.addEventListener('click', handleAgentStart);
  agentStopBtn?.addEventListener('click', handleAgentStop);
  document.getElementById('agent-submit-url-link')?.addEventListener('click', handleSubmitPageUrl);
  document.getElementById('agent-settings-btn')?.addEventListener('click', showSettingsModal);
  document.getElementById('agent-dismiss-error-btn')?.addEventListener('click', () => {
    const banner = document.getElementById('agent-error-banner');
    if (banner) banner.classList.remove('visible');
  });

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
    const [hasKey, userName, calendarStatus, aiProvider, scrollBackDays, additionalConvs, debugMode] = await Promise.all([
      hasGeminiKey(),
      getUserName(),
      getConnectionStatus(),
      getAIProvider(),
      getScrollBackDays(),
      getAdditionalConversations(),
      getDebugMode()
    ]);

    // Set scroll back days input value
    if (scrollBackDaysInput) {
      scrollBackDaysInput.value = scrollBackDays.toString();
    }

    // Set additional conversations input value
    if (additionalConversationsInput) {
      additionalConversationsInput.value = additionalConvs.toString();
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
function showView(viewName: 'get-started' | 'mode-select' | 'main' | 'import' | 'agent') {
  const allViews = [getStartedView, modeSelectView, mainView, importView, agentView];
  allViews.forEach(v => v?.classList.remove('active'));

  switch (viewName) {
    case 'get-started':
      getStartedView?.classList.add('active');
      break;
    case 'mode-select':
      modeSelectView?.classList.add('active');
      // Refresh My Trips list every time the user lands here so newly created / updated trips
      // appear without needing a sidepanel reload.
      void renderMyTripsSection();
      break;
    case 'main':
      mainView?.classList.add('active');
      break;
    case 'import':
      importView?.classList.add('active');
      break;
    case 'agent':
      agentView?.classList.add('active');
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
 * Handle additional conversations input change
 */
async function handleAdditionalConversationsChange() {
  const value = parseInt(additionalConversationsInput?.value || '0', 10);
  const count = Math.max(0, Math.min(25, isNaN(value) ? 0 : value));

  if (additionalConversationsInput) {
    additionalConversationsInput.value = count.toString();
  }

  try {
    await saveAdditionalConversations(count);
  } catch (error) {
    log(`Error saving additional conversations: ${(error as Error).message}`);
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

    // Check how many additional conversations to scan
    const additionalConvCount = await getAdditionalConversations();

    if (additionalConvCount > 0) {
      await handleMultiConversationExtract(additionalConvCount);
      return;
    }

    updateStatus('parsing');
    log('Parsing conversation from DOM...');

    // Get active tab and start tracking it
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    if (!isSupportedPlatformUrl(tab.url)) {
      throw new Error('Please open a supported page first. Supported platforms:\n• messages.google.com\n• www.messenger.com');
    }

    tabTracker.startTracking(tab.id, tab.windowId!, tab.title ?? 'Messages');

    // Check if we're on a conversation page
    const checkResult: any = await tabTracker.sendMessage({ type: 'CHECK_PAGE' });
    if (!checkResult?.isOnConversation) {
      throw new Error('Please open a specific conversation (not just the message list)');
    }

    // Check if we need to scroll back
    const scrollBackDays = await getScrollBackDays();
    if (scrollBackDays > 0) {
      updateStatus('scrolling');
      log(`Scrolling back ${scrollBackDays} days to load older messages...`);
      
      const scrollResult: any = await tabTracker.sendMessage({ 
        type: 'SCROLL_BACK_DAYS', 
        days: scrollBackDays 
      });
      
      if (!scrollResult.success) {
        log(`Scroll warning: ${scrollResult.error}`);
      } else if (scrollResult.reachedTarget) {
        log(`Successfully loaded messages from ${scrollBackDays} days ago`);
      } else {
        log(`Loaded messages back to: ${scrollResult.oldestMessageDate || 'unknown date'}`);
      }
    }

    // Request DOM parsing from content script
    const parseResult: any = await tabTracker.sendMessage({ type: 'PARSE_DOM' });
    
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

    // LLM extraction runs in the background — no tab dependency
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
      if (aiProvider === 'ambient_ai' && extractResult.error?.includes('Rate limit exceeded')) {
        const currentCount = await getDailyExtractCount();
        const limit = await getDailyExtractLimit();
        if (currentCount < limit) {
          await setDailyExtractCount(limit);
        }
        await handleRateLimitReached();
        return;
      }
      throw new Error(extractResult.error);
    }
    
    if (aiProvider === 'ambient_ai' && extractResult.isAmbientUser !== undefined) {
      await saveIsAmbientUser(extractResult.isAmbientUser);
      await updateAmbientProfileStatus();
    }
    
    if (aiProvider === 'ambient_ai') {
      await incrementDailyExtractCount();
    }

    const events: ExtractedEvent[] = extractResult.events;
    lastExtractedEvents = events;
    
    debugExtractedEvents = events;
    updateDebugButtonStates();
    
    log(`AI found ${events.length} potential event(s)`);

    displayExtractedEvents(events);

    const calendarConnected = await isCalendarConnected();
    if (!calendarConnected) {
      log('Calendar not connected - skipping calendar matching');
      updateStatus('complete');
      log('Event extraction complete! Connect Google Calendar to match events.');
      return;
    }

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
    tabTracker.stopTracking();
    hidePausedOverlay();
    await updateExtractButtonState();
  }
}

/**
 * Multi-conversation extraction flow.
 * Scans the current conversation plus N additional ones from the sidebar list.
 */
async function handleMultiConversationExtract(additionalCount: number) {
  const totalConversations = 1 + additionalCount;
  const aiProvider = await getAIProvider();

  try {
    // Upfront rate limit check for Ambient AI
    if (aiProvider === 'ambient_ai') {
      const currentCount = await getDailyExtractCount();
      const limit = await getDailyExtractLimit();
      const remaining = limit - currentCount;
      if (remaining < totalConversations) {
        showErrorBanner(`You have ${remaining} extraction(s) remaining today, but this will require ${totalConversations}. Reduce the number of conversations or wait until tomorrow.`);
        return;
      }
    }

    // Get active tab and start tracking it
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error('No active tab found');
    if (!isSupportedPlatformUrl(tab.url)) throw new Error('Please open a supported page first. Supported platforms:\n• messages.google.com\n• www.messenger.com');

    tabTracker.startTracking(tab.id, tab.windowId!, tab.title ?? 'Messages');

    const checkResult: any = await tabTracker.sendMessage({ type: 'CHECK_PAGE' });
    if (!checkResult?.isOnConversation) throw new Error('Please open a specific conversation first');

    const [apiKey, userName] = await Promise.all([getGeminiKey(), getUserName()]);
    if (!userName) throw new Error('Please enter your name in settings');
    if (aiProvider === 'gemini_key' && !apiKey) throw new Error('Please configure your Gemini API key in settings');

    const scrollBackDays = await getScrollBackDays();

    // Switch to multi-conversation UI
    if (singleResultsSection) singleResultsSection.style.display = 'none';
    if (conversationSection) conversationSection.style.display = 'none';
    if (matchedSection) matchedSection.style.display = 'none';
    if (multiProgressSection) multiProgressSection.style.display = 'block';
    if (multiResultsSection) multiResultsSection.style.display = 'block';
    if (multiResultsContainer) multiResultsContainer.innerHTML = '';

    // Get the conversation list for navigating to additional conversations
    const listResult: any = await tabTracker.sendMessage({ type: 'GET_CONVERSATION_LIST' });
    const conversationList: ConversationListItem[] = listResult.success ? listResult.conversations : [];

    // Figure out which conversation indices to process.
    const selectedEl: any = await tabTracker.sendMessage({ type: 'PARSE_DOM' });
    const currentTitle = selectedEl.success ? (selectedEl.conversation as ConversationDict).title : '';

    // Build the processing queue: current first, then top-N from sidebar
    interface QueueItem { index: number | null; name: string; }
    const queue: QueueItem[] = [{ index: null, name: currentTitle || 'Current conversation' }];

    let added = 0;
    for (const item of conversationList) {
      if (added >= additionalCount) break;
      if (item.name === currentTitle) continue;
      queue.push({ index: item.index, name: item.name });
      added++;
    }

    // Initialize results
    multiConversationResults = queue.map(q => ({
      conversation: { title: q.name, structured_messages: [] },
      extractedEvents: null,
      matchResults: null,
      status: 'pending' as const,
    }));
    renderMultiConversationResults();

    // Phase 1: Collect conversations and fire off extractions
    const extractionPromises: { idx: number; promise: Promise<any> }[] = [];

    for (let i = 0; i < queue.length; i++) {
      const qItem = queue[i];
      updateMultiProgress(i + 1, queue.length, `Scanning "${qItem.name}"...`);
      multiConversationResults[i].status = 'extracting';
      renderMultiConversationResults();

      // Navigate to the conversation if it's not the first (current) one
      if (i > 0 && qItem.index !== null) {
        log(`Navigating to "${qItem.name}"...`);
        const clickResult: any = await tabTracker.sendMessage({
          type: 'CLICK_CONVERSATION',
          index: qItem.index,
        });
        if (!clickResult.success) {
          multiConversationResults[i].status = 'error';
          multiConversationResults[i].error = 'Failed to open conversation';
          renderMultiConversationResults();
          continue;
        }
      }

      // Scroll back if needed
      if (scrollBackDays > 0) {
        log(`Scrolling back ${scrollBackDays} days in "${qItem.name}"...`);
        await tabTracker.sendMessage({ type: 'SCROLL_BACK_DAYS', days: scrollBackDays });
      }

      // Parse the DOM
      const parseResult: any = await tabTracker.sendMessage({ type: 'PARSE_DOM' });
      if (!parseResult.success) {
        multiConversationResults[i].status = 'error';
        multiConversationResults[i].error = parseResult.error;
        renderMultiConversationResults();
        continue;
      }

      const conversation: ConversationDict = parseResult.conversation;
      multiConversationResults[i].conversation = conversation;
      log(`Parsed "${conversation.title}": ${conversation.structured_messages.length} messages`);

      // Fire extraction (don't await — runs in the background service worker)
      const extractPromise = chrome.runtime.sendMessage({
        type: 'EXTRACT_EVENTS',
        conversation,
        apiKey: apiKey || '',
        userName,
        provider: aiProvider,
      });
      extractionPromises.push({ idx: i, promise: extractPromise });
      renderMultiConversationResults();
    }

    // Navigate back to the first conversation if we moved away
    if (queue.length > 1 && queue[0].index === null && conversationList.length > 0) {
      const firstItem = conversationList.find(c => c.name === currentTitle);
      if (firstItem) {
        await tabTracker.sendMessage({ type: 'CLICK_CONVERSATION', index: firstItem.index });
      }
    }

    // Phase 2: Collect extraction results (background ops — no tab dependency)
    updateMultiProgress(queue.length, queue.length, 'Waiting for AI extraction results...');

    for (const { idx, promise } of extractionPromises) {
      try {
        const result = await promise;
        if (!result.success) {
          multiConversationResults[idx].status = 'error';
          multiConversationResults[idx].error = result.error;
        } else {
          multiConversationResults[idx].extractedEvents = result.events;
          multiConversationResults[idx].status = 'complete';
          log(`Extraction complete for "${multiConversationResults[idx].conversation.title}": ${result.events.length} event(s)`);

          if (aiProvider === 'ambient_ai') {
            await incrementDailyExtractCount();
            if (result.isAmbientUser !== undefined) {
              await saveIsAmbientUser(result.isAmbientUser);
            }
          }
        }
      } catch (error) {
        multiConversationResults[idx].status = 'error';
        multiConversationResults[idx].error = (error as Error).message;
      }
      renderMultiConversationResults();
    }

    // Phase 3: Calendar matching for all extracted events (background ops)
    const calendarConnected = await isCalendarConnected();
    if (calendarConnected) {
      for (let i = 0; i < multiConversationResults.length; i++) {
        const cr = multiConversationResults[i];
        if (!cr.extractedEvents || cr.extractedEvents.length === 0) continue;

        const futureEvents = cr.extractedEvents.filter(
          e => (e.event_type === 'full_potential_event_details' || e.event_type === 'incomplete_event_details') && isEventInFuture(e)
        );
        if (futureEvents.length === 0) continue;

        cr.status = 'matching';
        renderMultiConversationResults();

        try {
          const dateRange = getDateRangeFromEvents(futureEvents);
          const calendarEvents = await getEventsFromAllCalendars(dateRange.timeMin, dateRange.timeMax);

          const matchResult = await chrome.runtime.sendMessage({
            type: 'MATCH_EVENTS',
            extractedEvents: futureEvents,
            calendarEvents,
            apiKey: apiKey || '',
            provider: aiProvider,
          });

          if (matchResult.success) {
            cr.matchResults = matchResult.matches;
          }
        } catch (error) {
          log(`Matching error for "${cr.conversation.title}": ${(error as Error).message}`);
        }
        cr.status = 'complete';
        renderMultiConversationResults();
      }
    }

    updateMultiProgress(queue.length, queue.length, 'All conversations processed');
    updateStatus('complete');
    log('Multi-conversation extraction complete!');

  } catch (error) {
    updateStatus('error');
    const errorMsg = (error as Error).message;
    showErrorBanner(`Multi-conversation extraction failed: ${errorMsg}`);
    log(`Error: ${errorMsg}`);
  } finally {
    tabTracker.stopTracking();
    hidePausedOverlay();
    await updateExtractButtonState();
  }
}

/**
 * Update the multi-conversation progress bar
 */
function updateMultiProgress(current: number, total: number, statusText: string) {
  if (multiProgressStatus) {
    multiProgressStatus.textContent = statusText;
  }
  if (multiProgressBar) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    multiProgressBar.style.width = `${pct}%`;
  }
}

/**
 * Render the multi-conversation results UI
 */
function renderMultiConversationResults() {
  if (!multiResultsContainer) return;

  let html = '';
  multiConversationResults.forEach((cr, groupIdx) => {
    html += renderConversationGroup(cr, groupIdx);
  });
  multiResultsContainer.innerHTML = html;

  // Wire up action listeners inside the groups
  setupMultiConversationListeners();
}

/**
 * Render a single collapsible conversation group
 */
function renderConversationGroup(cr: ConversationResult, groupIdx: number): string {
  const title = escapeHtml(cr.conversation.title || `Conversation ${groupIdx + 1}`);
  const msgCount = cr.conversation.structured_messages.length;

  let badge = '';
  let eventSummary = '';
  switch (cr.status) {
    case 'pending':
      badge = '<span class="conv-status-badge pending">Pending</span>';
      break;
    case 'extracting':
      badge = '<span class="conv-status-badge extracting">Extracting...</span>';
      break;
    case 'matching':
      badge = '<span class="conv-status-badge matching">Matching...</span>';
      break;
    case 'error':
      badge = `<span class="conv-status-badge error">Error</span>`;
      break;
    case 'complete': {
      const events = cr.extractedEvents || [];
      const actionable = events.filter(e => e.event_type !== 'not_an_event');
      const futureCount = actionable.filter(isEventInFuture).length;
      badge = '<span class="conv-status-badge complete">Done</span>';
      eventSummary = futureCount > 0 ? `${futureCount} event(s) found` : 'No events found';
      break;
    }
  }

  // Count new events (no_match) for "Add All New" button
  const newMatches = (cr.matchResults || []).filter(m => m.match_type === 'no_match');
  const addAllBtn = newMatches.length > 0
    ? `<button class="add-all-btn conv-group-add-all" data-group="${groupIdx}">Add All New (${newMatches.length})</button>`
    : '';

  // Determine if this group should be open
  const isOpen = cr.status === 'extracting' || cr.status === 'matching'
    || (cr.status === 'complete' && (cr.extractedEvents?.length ?? 0) > 0);

  let inner = '';
  if (cr.status === 'error') {
    inner = `<p class="conv-group-error">${escapeHtml(cr.error || 'Unknown error')}</p>`;
  } else if (cr.status === 'complete' && cr.extractedEvents) {
    inner = renderConversationGroupEvents(cr, groupIdx);
  } else if (cr.status === 'extracting' || cr.status === 'matching') {
    inner = '<div class="conv-group-loading">Processing...</div>';
  }

  return `<details class="conversation-group" data-group="${groupIdx}" ${isOpen ? 'open' : ''}>
    <summary class="conversation-group-header">
      <span class="conv-group-title">${title}</span>
      <span class="conv-group-msg-count">${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
      ${badge}
      <span class="conv-group-summary">${eventSummary}</span>
      ${addAllBtn}
    </summary>
    <div class="conversation-group-body">
      <p class="conv-group-detail">${msgCount} message${msgCount !== 1 ? 's' : ''} searched</p>
      ${inner}
    </div>
  </details>`;
}

/**
 * Render the event cards and match cards inside a conversation group
 */
function renderConversationGroupEvents(cr: ConversationResult, groupIdx: number): string {
  if (!cr.extractedEvents || cr.extractedEvents.length === 0) {
    return '<p class="placeholder">No events found in this conversation.</p>';
  }

  const actionable = cr.extractedEvents.filter(e => e.event_type !== 'not_an_event');
  const futureEvents = actionable.filter(isEventInFuture);

  if (futureEvents.length === 0) {
    return '<p class="placeholder">No upcoming events found.</p>';
  }

  let html = '';

  if (cr.matchResults && cr.matchResults.length > 0) {
    const byType = {
      no_match: cr.matchResults.filter(m => m.match_type === 'no_match'),
      certain_update: cr.matchResults.filter(m => m.match_type === 'certain_update'),
      possible_update: cr.matchResults.filter(m => m.match_type === 'possible_update'),
      no_update: cr.matchResults.filter(m => m.match_type === 'no_update'),
    };

    if (byType.no_match.length > 0) {
      html += `<p class="match-section-header">New Events (${byType.no_match.length})</p>`;
      byType.no_match.forEach((match, idx) => {
        html += renderMatchCard(match, `multi_${groupIdx}_no_match_${idx}`);
      });
    }
    if (byType.certain_update.length > 0) {
      html += `<p class="match-section-header">Events to Update (${byType.certain_update.length})</p>`;
      byType.certain_update.forEach((match, idx) => {
        html += renderMatchCard(match, `multi_${groupIdx}_certain_update_${idx}`);
      });
    }
    if (byType.possible_update.length > 0) {
      html += `<p class="match-section-header">Review Needed (${byType.possible_update.length})</p>`;
      byType.possible_update.forEach((match, idx) => {
        html += renderMatchCard(match, `multi_${groupIdx}_possible_update_${idx}`);
      });
    }
    if (byType.no_update.length > 0) {
      html += `<p class="match-section-header">Already in Calendar (${byType.no_update.length})</p>`;
      byType.no_update.forEach((match, idx) => {
        html += renderMatchCard(match, `multi_${groupIdx}_no_update_${idx}`);
      });
    }
  } else {
    futureEvents.forEach(event => {
      html += renderEventCard(event, false);
    });
  }

  return html;
}

/**
 * Wire up action listeners inside multi-conversation result groups.
 */
function setupMultiConversationListeners() {
  document.querySelectorAll('.conv-group-add-all').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const groupIdx = parseInt((btn as HTMLElement).dataset.group || '0', 10);
      const cr = multiConversationResults[groupIdx];
      if (!cr?.matchResults) return;

      const newMatches = cr.matchResults.filter(m => m.match_type === 'no_match');
      for (const match of newMatches) {
        const cardId = `multi_${groupIdx}_no_match_${cr.matchResults.indexOf(match)}`;
        const addBtn = document.querySelector(`.action-btn.add-btn[data-card-id="${cardId}"]`) as HTMLButtonElement | null;
        if (addBtn && !addBtn.disabled) {
          addBtn.click();
          await new Promise(r => setTimeout(r, 300));
        }
      }
    });
  });

  setupMatchActionListeners();
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
      ${renderCreateTripBanner(actionableEvents)}
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
  setupCreateTripButton(actionableEvents);
}

// ---------- Create Trip Page flow ----------

function findTripEvent(events: ExtractedEvent[]): ExtractedEvent | null {
  return events.find(e =>
    e.event_type === 'full_potential_event_details' &&
    typeof e.summary === 'string' &&
    e.summary.toLowerCase().includes('trip')
  ) || null;
}

function renderCreateTripBanner(events: ExtractedEvent[]): string {
  const tripEvent = findTripEvent(events);
  if (!tripEvent) return '';
  const summary = escapeHtml(tripEvent.summary || 'Trip');
  return `
    <div id="create-trip-banner" class="create-trip-banner">
      <div class="create-trip-banner-text">
        <strong>This looks like a trip.</strong>
        <span>Build a shareable trip page for "${summary}".</span>
      </div>
      <button id="create-trip-btn" class="create-trip-btn" type="button">Create trip page</button>
      <div id="create-trip-status" class="create-trip-status"></div>
    </div>
  `;
}

async function setupCreateTripButton(events: ExtractedEvent[]) {
  const btn = document.getElementById('create-trip-btn') as HTMLButtonElement | null;
  const banner = document.getElementById('create-trip-banner');
  if (!btn) return;

  // Check whether this conversation has already produced a trip page. If so, switch the
  // primary CTA to an Update flow against the existing trip and offer a secondary "create a
  // new trip page" link in case the user really wants a fresh trip.
  let matchingTrip: CreatedTripEntry | null = null;
  try {
    const title = lastParsedConversation?.title || '';
    if (title) {
      matchingTrip = await findCreatedTripByConversationTitle(title);
    }
  } catch (e) {
    log(`[CreateTripBanner] storage lookup failed: ${e}`);
  }

  if (matchingTrip) {
    // Update flow.
    btn.textContent = 'Update trip page';
    btn.removeEventListener('click', noop);
    btn.addEventListener('click', () => handleUpdateTrip(events, matchingTrip!));

    // Inject a small explanatory line + a fallback "create new" link.
    if (banner) {
      const textEl = banner.querySelector('.create-trip-banner-text') as HTMLElement | null;
      if (textEl) {
        const tripLabel = escapeHtml(matchingTrip.summary || 'this trip');
        textEl.innerHTML = `
          <strong>Existing trip detected.</strong>
          <span>Update "${tripLabel}" with the latest from this conversation, or
          <a href="#" id="create-new-trip-link" class="create-trip-secondary">create a new trip page</a>
          if this is a different trip.</span>
        `;
        const newLink = textEl.querySelector('#create-new-trip-link') as HTMLAnchorElement | null;
        newLink?.addEventListener('click', (e) => {
          e.preventDefault();
          handleCreateTrip(events);
        });
      }
    }
  } else {
    // Default: create flow.
    btn.addEventListener('click', () => handleCreateTrip(events));
  }
}

// Tiny no-op so removeEventListener has a stable reference if we ever need to swap handlers.
function noop() {}

async function handleCreateTrip(events: ExtractedEvent[]) {
  const btn = document.getElementById('create-trip-btn') as HTMLButtonElement | null;
  const status = document.getElementById('create-trip-status');
  if (!btn || !status) return;
  const tripEvent = findTripEvent(events);
  if (!tripEvent) {
    status.textContent = 'Could not find a trip event in this conversation.';
    status.className = 'create-trip-status error';
    return;
  }
  const siblings = events.filter(e => e !== tripEvent && e.event_type !== 'not_an_event');

  btn.disabled = true;
  status.className = 'create-trip-status';

  try {
    const { createCalendar, setCalendarPublicRead, createEvent } = await import('../lib/calendarApi');
    const { createTripViaAmbient } = await import('../lib/ambientApi');

    status.textContent = 'Creating trip calendar…';
    const cal = await createCalendar(tripEvent.summary || 'Trip');

    status.textContent = 'Sharing calendar…';
    await setCalendarPublicRead(cal.id);

    status.textContent = `Adding ${siblings.length} event(s)…`;
    for (const ev of siblings) {
      try {
        const body: any = {
          summary: ev.summary,
          description: ev.description || '',
        };
        if (ev.location) body.location = ev.location;
        if (ev.start) body.start = ev.start;
        if (ev.end) body.end = ev.end;
        await createEvent(body, cal.id);
      } catch (e) {
        log(`[CreateTrip] failed to insert event "${ev.summary}": ${e}`);
      }
    }

    status.textContent = 'Saving trip page…';
    const result = await createTripViaAmbient(tripEvent, siblings, cal.id, true);

    // Persist locally so the user can find their trips later (and so re-import / "My Trips"
    // can find them later). Capture the conversation title so re-import detection can match
    // on the next scrape, and the per-trip Google Calendar id so future flows can write
    // through directly when needed.
    try {
      await upsertCreatedTrip({
        shareUrl: result.shareUrl,
        shareToken: result.shareToken,
        summary: tripEvent.summary,
        conversationTitle: lastParsedConversation?.title || '',
        googleCalendarId: cal.id,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      log(`[CreateTrip] failed to persist trip locally: ${e}`);
    }

    status.innerHTML = `<a href="${escapeHtml(result.shareUrl)}" target="_blank" class="create-trip-link">Open trip page →</a>`;
    status.className = 'create-trip-status success';
    btn.textContent = 'Trip created';
    btn.classList.add('done');
  } catch (e: any) {
    log(`[CreateTrip] error: ${e?.message || e}`);
    status.textContent = `Failed: ${e?.message || 'unknown error'}`;
    status.className = 'create-trip-status error';
    btn.disabled = false;
  }
}

// ---------- My Trips list (mode-select view) ----------
//
// Renders chrome.storage.local.createdTrips into the #my-trips-section. Visible only when
// at least one trip exists. Lets the user open or remove entries.

function formatTripTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

async function renderMyTripsSection() {
  const section = document.getElementById('my-trips-section');
  const list = document.getElementById('my-trips-list');
  if (!section || !list) return;

  let trips: CreatedTripEntry[] = [];
  try {
    trips = await getCreatedTrips();
  } catch (e) {
    log(`[MyTrips] failed to load: ${e}`);
  }

  if (!trips.length) {
    section.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  section.style.display = '';
  list.innerHTML = trips.map((t) => {
    const ts = formatTripTimestamp(t.lastUpdatedAt || t.createdAt);
    const titleSuffix = t.conversationTitle
      ? ` <span class="my-trips-conv">from ${escapeHtml(t.conversationTitle)}</span>`
      : '';
    return `
      <li class="my-trips-item" data-token="${escapeHtml(t.shareToken)}">
        <a href="${escapeHtml(t.shareUrl)}" target="_blank" class="my-trips-link">
          <span class="my-trips-summary">${escapeHtml(t.summary || 'Untitled trip')}</span>
          <span class="my-trips-meta">${escapeHtml(ts)}${titleSuffix}</span>
        </a>
        <button type="button" class="my-trips-remove" aria-label="Remove from list" data-token="${escapeHtml(t.shareToken)}">×</button>
      </li>
    `;
  }).join('');

  list.querySelectorAll<HTMLButtonElement>('.my-trips-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const token = btn.getAttribute('data-token') || '';
      if (!token) return;
      try {
        await removeCreatedTrip(token);
      } catch (err) {
        log(`[MyTrips] remove failed: ${err}`);
      }
      void renderMyTripsSection();
    });
  });
}

// ---------- Update existing trip (re-import) ----------
//
// Triggered when setupCreateTripButton finds a stored trip with a conversation title that
// matches the current scrape. Compares the new scrape's events against the existing trip's
// events and PATCHes / POSTs the differences via the trip-edit endpoints. Doesn't delete
// existing events for now — the safer half of a sync; auto-delete can land in v2 once we're
// confident about false-removal risk.

function shapesEqual(a: any, b: any): boolean {
  // Cheap deep-equal for plain JSON-ish structures (date dicts, flight_details). The data
  // shapes here are tiny (max a handful of keys), so JSON.stringify is fine.
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeSummaryForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function handleUpdateTrip(events: ExtractedEvent[], existingTrip: CreatedTripEntry) {
  const btn = document.getElementById('create-trip-btn') as HTMLButtonElement | null;
  const status = document.getElementById('create-trip-status');
  if (!btn || !status) return;

  const tripEvent = findTripEvent(events);
  if (!tripEvent) {
    status.textContent = 'No trip event found in this conversation.';
    status.className = 'create-trip-status error';
    return;
  }
  const siblings = events.filter(e => e !== tripEvent && e.event_type !== 'not_an_event');

  btn.disabled = true;
  status.className = 'create-trip-status';
  status.textContent = 'Loading existing trip…';

  try {
    const { getTripDetails, patchTrip, addTripEvent, updateTripEvent } = await import('../lib/ambientApi');

    const detail = await getTripDetails(existingTrip.shareToken);
    if (!detail) {
      status.textContent = 'Could not load existing trip — it may have been deleted. Use "create a new trip page" instead.';
      status.className = 'create-trip-status error';
      btn.disabled = false;
      return;
    }

    // 1. Patch trip metadata if any of summary/location/dates/accommodation changed.
    const tripPatch: any = {};
    if (tripEvent.summary && tripEvent.summary !== detail.summary) tripPatch.summary = tripEvent.summary;
    if (tripEvent.location && tripEvent.location !== detail.location) tripPatch.location = tripEvent.location;
    if (tripEvent.start && !shapesEqual(tripEvent.start, detail.start)) tripPatch.start = tripEvent.start;
    if (tripEvent.end && !shapesEqual(tripEvent.end, detail.end)) tripPatch.end = tripEvent.end;
    const newAccom = (tripEvent.trip_accommodation_details || '').trim();
    if (newAccom && newAccom !== (detail.accommodation_details || '').trim()) {
      tripPatch.accommodation_details = newAccom;
    }
    if (Object.keys(tripPatch).length > 0) {
      status.textContent = 'Updating trip details…';
      const resp = await patchTrip(existingTrip.shareToken, tripPatch);
      if (!resp.success) {
        log(`[UpdateTrip] trip patch failed: ${(resp as any).error}`);
      }
    }

    // 2. Match scraped sibling events against existing trip events by normalized summary.
    //    For matched events: PATCH if any field differs.
    //    For unmatched scraped events: POST as new event under the trip.
    //    Existing-but-not-scraped events are left alone (no auto-delete in v1).
    const existingBySummary = new Map<string, typeof detail.events[0]>();
    for (const ev of detail.events) {
      if (!ev.is_trip_parent) {
        existingBySummary.set(normalizeSummaryForMatch(ev.summary), ev);
      }
    }

    let updated = 0;
    let added = 0;
    let i = 0;
    for (const ev of siblings) {
      i++;
      status.textContent = `Syncing events (${i}/${siblings.length})…`;
      const key = normalizeSummaryForMatch(ev.summary);
      const existing = existingBySummary.get(key);
      try {
        if (existing) {
          const patch: any = {};
          if (ev.summary && ev.summary !== existing.summary) patch.summary = ev.summary;
          if (ev.description && ev.description !== existing.description) patch.description = ev.description;
          if (ev.location && ev.location !== existing.location) patch.location = ev.location;
          if (ev.start && !shapesEqual(ev.start, existing.start)) patch.start = ev.start;
          if (ev.end && !shapesEqual(ev.end, existing.end)) patch.end = ev.end;
          if (ev.flight_details && !shapesEqual(ev.flight_details, existing.flight_details)) {
            patch.flight_details = ev.flight_details;
          }
          if (Object.keys(patch).length > 0) {
            const resp = await updateTripEvent(existingTrip.shareToken, existing.id, patch);
            if (resp.success) updated++;
            else log(`[UpdateTrip] PATCH event ${existing.id} failed: ${(resp as any).error}`);
          }
        } else {
          const body: any = { summary: ev.summary };
          if (ev.description) body.description = ev.description;
          if (ev.location) body.location = ev.location;
          if (ev.start) body.start = ev.start;
          if (ev.end) body.end = ev.end;
          if (ev.flight_details) body.flight_details = ev.flight_details;
          const resp = await addTripEvent(existingTrip.shareToken, body);
          if (resp.success) added++;
          else log(`[UpdateTrip] POST new event failed: ${(resp as any).error}`);
        }
      } catch (e) {
        log(`[UpdateTrip] error syncing "${ev.summary}": ${e}`);
      }
    }

    // Update the local cache with a fresh lastUpdatedAt timestamp.
    try {
      await upsertCreatedTrip({
        ...existingTrip,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (e) {
      log(`[UpdateTrip] failed to update local cache: ${e}`);
    }

    const summaryLine = `${updated} updated, ${added} new`;
    status.innerHTML = `${summaryLine} · <a href="${escapeHtml(existingTrip.shareUrl)}" target="_blank" class="create-trip-link">Open trip page →</a>`;
    status.className = 'create-trip-status success';
    btn.textContent = 'Trip updated';
    btn.classList.add('done');
  } catch (e: any) {
    log(`[UpdateTrip] error: ${e?.message || e}`);
    status.textContent = `Failed: ${e?.message || 'unknown error'}`;
    status.className = 'create-trip-status error';
    btn.disabled = false;
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
function displayMatchResults(matches: MatchResult[], isImportView: boolean = false) {
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

  const hasNewEvents = byType.no_match.length > 0;

  if (!isImportView && hasNewEvents) {
    // Messages flow: calendar picker above everything
    html += `<div class="calendar-picker" id="calendar-picker">
      <label class="calendar-picker-label" for="calendar-select">Add new events to:</label>
      <div class="calendar-picker-row">
        <select id="calendar-select" class="calendar-select">
          <option value="" disabled selected>Loading calendars...</option>
        </select>
      </div>
      <div id="new-calendar-form" class="new-calendar-form" style="display: none;">
        <input type="text" id="new-calendar-name" class="new-calendar-input" placeholder="e.g., Devin school cal">
        <button id="create-calendar-btn" class="save-btn">Create</button>
        <button id="cancel-new-calendar-btn" class="cancel-new-calendar-btn">Cancel</button>
      </div>
    </div>`;
  }

  // New events (no_match)
  if (byType.no_match.length > 0) {
    if (isImportView) {
      // Import flow: header, then dropdown + Add All on same line
      html += `<p class="match-section-header">New Events (${byType.no_match.length})</p>`;
      html += `<div class="import-calendar-row" id="import-calendar-row">
        <select id="calendar-select" class="calendar-select import-calendar-select">
          <option value="" disabled selected>Choose calendar to add events to</option>
        </select>
        ${byType.no_match.length > 1 ? `<button class="add-all-btn" data-action="add-all" data-match-type="no_match" disabled>Add All</button>` : ''}
      </div>
      <div id="new-calendar-form" class="import-new-calendar-form" style="display: none;">
        <button id="cancel-new-calendar-btn" class="import-cancel-btn" title="Cancel">&times;</button>
        <input type="text" id="new-calendar-name" class="new-calendar-input" placeholder="e.g., Devin school cal">
        <button id="create-calendar-btn" class="save-btn">Create</button>
      </div>`;
    } else {
      html += `<div class="match-section-header-row">
        <p class="match-section-header">New Events (${byType.no_match.length})</p>
        ${byType.no_match.length > 1 ? `<button class="add-all-btn" data-action="add-all" data-match-type="no_match">Add All</button>` : ''}
      </div>`;
    }
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

  // Set up calendar picker
  if (hasNewEvents) {
    if (isImportView) {
      setupImportCalendarPicker();
    } else {
      setupCalendarPicker();
    }
  }
}

/**
 * Set up the calendar picker dropdown, populate with user's calendars,
 * and handle the "Create new calendar" option.
 */
async function setupCalendarPicker() {
  const selectEl = document.getElementById('calendar-select') as HTMLSelectElement | null;
  const newCalForm = document.getElementById('new-calendar-form');
  const newCalNameInput = document.getElementById('new-calendar-name') as HTMLInputElement | null;
  const createBtn = document.getElementById('create-calendar-btn');
  const cancelBtn = document.getElementById('cancel-new-calendar-btn');

  if (!selectEl) return;

  // Load persisted calendar selection
  const persistedId = await getSelectedCalendarId();
  if (persistedId && !selectedCalendarId) {
    selectedCalendarId = persistedId;
  }

  try {
    const calendars = await listCalendars();
    const writableCalendars = calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');

    selectEl.innerHTML = '';

    const ambientCal = writableCalendars.find(c => c.summary.toLowerCase() === 'ambient');

    writableCalendars.forEach(cal => {
      const option = document.createElement('option');
      option.value = cal.id;
      option.textContent = cal.summary + (cal.primary ? ' (primary)' : '');
      selectEl.appendChild(option);
    });

    const createOption = document.createElement('option');
    createOption.value = '__create_new__';
    createOption.textContent = '+ Create new calendar...';
    selectEl.appendChild(createOption);

    if (selectedCalendarId && writableCalendars.some(c => c.id === selectedCalendarId)) {
      selectEl.value = selectedCalendarId;
    } else if (ambientCal) {
      selectEl.value = ambientCal.id;
      selectedCalendarId = ambientCal.id;
      saveSelectedCalendarId(ambientCal.id);
    } else {
      // No Ambient calendar exists — show "Ambient" as default text; will auto-create on first add
      const ambientPlaceholder = document.createElement('option');
      ambientPlaceholder.value = '__ambient_auto__';
      ambientPlaceholder.textContent = 'Ambient';
      selectEl.insertBefore(ambientPlaceholder, selectEl.firstChild);
      selectEl.value = '__ambient_auto__';
      selectedCalendarId = '__ambient_auto__';
    }
  } catch (error) {
    console.error('[Ambient] Failed to load calendars:', error);
    selectEl.innerHTML = '<option value="">Failed to load calendars</option>';
  }

  selectEl.addEventListener('change', () => {
    if (selectEl.value === '__create_new__') {
      if (newCalForm) newCalForm.style.display = 'flex';
      if (newCalNameInput) { newCalNameInput.value = ''; newCalNameInput.focus(); }
    } else {
      if (newCalForm) newCalForm.style.display = 'none';
      selectedCalendarId = selectEl.value;
      if (selectEl.value !== '__ambient_auto__') {
        saveSelectedCalendarId(selectEl.value);
      }
    }
  });

  cancelBtn?.addEventListener('click', () => {
    if (newCalForm) newCalForm.style.display = 'none';
    if (selectedCalendarId) {
      selectEl.value = selectedCalendarId;
    } else if (selectEl.options.length > 1) {
      selectEl.selectedIndex = 0;
      selectedCalendarId = selectEl.value;
    }
  });

  createBtn?.addEventListener('click', async () => {
    const name = newCalNameInput?.value.trim();
    if (!name) return;

    if (createBtn) {
      (createBtn as HTMLButtonElement).disabled = true;
      createBtn.textContent = 'Creating...';
    }

    try {
      const newCal = await createCalendar(name);
      log(`Created new calendar: ${newCal.summary}`);

      const option = document.createElement('option');
      option.value = newCal.id;
      option.textContent = newCal.summary;
      const createNewOption = selectEl.querySelector('option[value="__create_new__"]');
      selectEl.insertBefore(option, createNewOption);

      selectEl.value = newCal.id;
      selectedCalendarId = newCal.id;
      saveSelectedCalendarId(newCal.id);
      if (newCalForm) newCalForm.style.display = 'none';
    } catch (error) {
      log(`Error creating calendar: ${(error as Error).message}`);
    } finally {
      if (createBtn) {
        (createBtn as HTMLButtonElement).disabled = false;
        createBtn.textContent = 'Create';
      }
    }
  });
}

/**
 * Set up the import view's calendar picker with inline create form
 * and disabled add-button logic until a calendar is selected.
 */
async function setupImportCalendarPicker() {
  const selectEl = document.getElementById('calendar-select') as HTMLSelectElement | null;
  const newCalForm = document.getElementById('new-calendar-form');
  const newCalNameInput = document.getElementById('new-calendar-name') as HTMLInputElement | null;
  const createBtn = document.getElementById('create-calendar-btn');
  const cancelBtn = document.getElementById('cancel-new-calendar-btn');

  if (!selectEl) return;

  // Load persisted calendar selection
  const persistedId = await getSelectedCalendarId();
  if (persistedId && !selectedCalendarId) {
    selectedCalendarId = persistedId;
  }

  setImportAddButtonsEnabled(false);

  try {
    const calendars = await listCalendars();
    const writableCalendars = calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');
    const ambientCal = writableCalendars.find(c => c.summary.toLowerCase() === 'ambient');

    selectEl.innerHTML = '';

    writableCalendars.forEach(cal => {
      const option = document.createElement('option');
      option.value = cal.id;
      option.textContent = cal.summary + (cal.primary ? ' (primary)' : '');
      selectEl.appendChild(option);
    });

    const createOption = document.createElement('option');
    createOption.value = '__create_new__';
    createOption.textContent = '+ Create new calendar...';
    selectEl.appendChild(createOption);

    if (selectedCalendarId && selectedCalendarId !== '__ambient_auto__' && writableCalendars.some(c => c.id === selectedCalendarId)) {
      selectEl.value = selectedCalendarId;
      setImportAddButtonsEnabled(true);
    } else if (ambientCal) {
      selectEl.value = ambientCal.id;
      selectedCalendarId = ambientCal.id;
      saveSelectedCalendarId(ambientCal.id);
      setImportAddButtonsEnabled(true);
    } else {
      const ambientPlaceholder = document.createElement('option');
      ambientPlaceholder.value = '__ambient_auto__';
      ambientPlaceholder.textContent = 'Ambient';
      selectEl.insertBefore(ambientPlaceholder, selectEl.firstChild);
      selectEl.value = '__ambient_auto__';
      selectedCalendarId = '__ambient_auto__';
      setImportAddButtonsEnabled(true);
    }
  } catch (error) {
    console.error('[Ambient] Failed to load calendars:', error);
    selectEl.innerHTML = '<option value="" disabled selected>Failed to load calendars</option>';
  }

  selectEl.addEventListener('change', () => {
    if (selectEl.value === '__create_new__') {
      if (newCalForm) newCalForm.style.display = 'flex';
      if (newCalNameInput) { newCalNameInput.value = ''; newCalNameInput.focus(); }
    } else {
      if (newCalForm) newCalForm.style.display = 'none';
      selectedCalendarId = selectEl.value;
      if (selectEl.value !== '__ambient_auto__') {
        saveSelectedCalendarId(selectEl.value);
      }
      setImportAddButtonsEnabled(true);
    }
  });

  cancelBtn?.addEventListener('click', () => {
    if (newCalForm) newCalForm.style.display = 'none';
    if (selectedCalendarId) {
      selectEl.value = selectedCalendarId;
    } else {
      selectEl.selectedIndex = 0;
    }
  });

  createBtn?.addEventListener('click', async () => {
    const name = newCalNameInput?.value.trim();
    if (!name) return;

    if (createBtn) {
      (createBtn as HTMLButtonElement).disabled = true;
      createBtn.textContent = 'Creating...';
    }

    try {
      const newCal = await createCalendar(name);
      log(`Created new calendar: ${newCal.summary}`);

      const option = document.createElement('option');
      option.value = newCal.id;
      option.textContent = newCal.summary;
      const createNewOption = selectEl.querySelector('option[value="__create_new__"]');
      selectEl.insertBefore(option, createNewOption);

      // Remove the __ambient_auto__ placeholder if present
      const autoOpt = selectEl.querySelector('option[value="__ambient_auto__"]');
      if (autoOpt) autoOpt.remove();

      selectEl.value = newCal.id;
      selectedCalendarId = newCal.id;
      saveSelectedCalendarId(newCal.id);
      if (newCalForm) newCalForm.style.display = 'none';
      setImportAddButtonsEnabled(true);
    } catch (error) {
      log(`Error creating calendar: ${(error as Error).message}`);
    } finally {
      if (createBtn) {
        (createBtn as HTMLButtonElement).disabled = false;
        createBtn.textContent = 'Create';
      }
    }
  });

  document.querySelectorAll('.action-btn.add-btn, .add-all-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if ((btn as HTMLButtonElement).disabled) {
        e.stopPropagation();
        e.preventDefault();
        selectEl.focus();
        selectEl.showPicker?.();
      }
    }, true);
  });
}

/**
 * Enable or disable all add/add-all buttons in the import view.
 */
function setImportAddButtonsEnabled(enabled: boolean) {
  document.querySelectorAll('.action-btn.add-btn').forEach(btn => {
    (btn as HTMLButtonElement).disabled = !enabled;
    btn.classList.toggle('btn-disabled-cal', !enabled);
  });
  document.querySelectorAll('.add-all-btn').forEach(btn => {
    (btn as HTMLButtonElement).disabled = !enabled;
    btn.classList.toggle('btn-disabled-cal', !enabled);
  });
}

/**
 * Get the calendar ID to use for adding events.
 * If "__ambient_auto__" is selected, auto-creates the Ambient calendar first,
 * then updates the dropdown and persists the real ID.
 */
async function getTargetCalendarId(): Promise<string> {
  if (selectedCalendarId === '__ambient_auto__') {
    const realId = await getOrCreateAmbientCalendar();
    selectedCalendarId = realId;
    saveSelectedCalendarId(realId);

    // Update dropdown to show real calendar
    const selectEl = document.getElementById('calendar-select') as HTMLSelectElement | null;
    if (selectEl) {
      const autoOpt = selectEl.querySelector('option[value="__ambient_auto__"]');
      if (autoOpt) autoOpt.remove();
      const exists = Array.from(selectEl.options).some(o => o.value === realId);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = realId;
        opt.textContent = 'Ambient';
        selectEl.insertBefore(opt, selectEl.firstChild);
      }
      selectEl.value = realId;
    }
    return realId;
  }
  if (selectedCalendarId) {
    return selectedCalendarId;
  }
  return getOrCreateAmbientCalendar();
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
    const targetCalendarId = await getTargetCalendarId();
    console.log('[Ambient] Using target calendar:', targetCalendarId);
    
    console.log('[Ambient] Calling createEvent...');
    const createdEvent = await createEvent(newEvent, targetCalendarId);
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
 * Handle "Add All" or "Update All" button click.
 * When filters are active, only processes visible (non-hidden) cards.
 */
async function handleAddAllToCalendar(event: Event) {
  const btn = event.target as HTMLButtonElement;
  const matchType = btn.dataset.matchType;
  
  if (!matchType || !lastMatchResults) {
    log('Error: Missing match type or results');
    return;
  }
  
  // Get all matches of this type
  const allMatchesOfType = lastMatchResults.filter(m => m.match_type === matchType);
  
  if (allMatchesOfType.length === 0) {
    log('No events to process');
    return;
  }

  // Build set of visible indices when filters are active
  const hasActiveFilters = activeFilterIds.size > 0;
  const visibleIndices = new Set<number>();
  if (hasActiveFilters) {
    for (const cat of filterCategories) {
      if (activeFilterIds.has(cat.id)) {
        for (const idx of cat.eventIndices) visibleIndices.add(idx);
      }
    }
  }
  
  // Disable the button and show progress
  btn.disabled = true;
  const originalText = btn.textContent || '';
  btn.innerHTML = `<span class="btn-spinner"></span> Processing...`;
  btn.classList.add('loading');
  
  let successCount = 0;
  let errorCount = 0;
  let skippedByFilter = 0;
  
  log(`Processing ${allMatchesOfType.length} events...`);
  
  for (let idx = 0; idx < allMatchesOfType.length; idx++) {
    const match = allMatchesOfType[idx];
    const cardId = `${matchType}_${idx}`;

    // Skip if hidden by active filter
    if (hasActiveFilters && !visibleIndices.has(idx)) {
      skippedByFilter++;
      continue;
    }

    const card = document.querySelector(`.match-card[data-card-id="${cardId}"]`);
    
    // Skip if already processed (check if action buttons are gone)
    if (card) {
      const actionsDiv = card.querySelector('.match-actions');
      const hasActionBtn = actionsDiv?.querySelector('.action-btn:not(:disabled)');
      if (!hasActionBtn) {
        continue;
      }
    }
    
    try {
      if (matchType === 'no_match') {
        await addEventToCalendarBulk(match, cardId);
        successCount++;
      } else if (matchType === 'certain_update') {
        await updateEventInCalendarBulk(match, cardId);
        successCount++;
      }
      
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
  
  const filterNote = skippedByFilter > 0 ? ` (${skippedByFilter} filtered out)` : '';
  log(`Bulk operation complete: ${successCount} succeeded, ${errorCount} failed${filterNote}`);
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
  
  const targetCalendarId = await getTargetCalendarId();
  
  // Create the event
  await createEvent(newEvent, targetCalendarId);
  
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
    
    if (!isSupportedPlatformUrl(tab.url)) {
      throw new Error('Please open a supported page first. Supported platforms:\n• messages.google.com\n• www.messenger.com');
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
    
    if (!isSupportedPlatformUrl(tab.url)) {
      throw new Error('Please open a supported page first. Supported platforms:\n• messages.google.com\n• www.messenger.com');
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
    updateImportStatus('complete');
    importLog('Import complete!');

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

  const importSection = document.getElementById('import-results-section');

  const actionableEvents = events.filter(e => e.event_type !== 'not_an_event');

  if (actionableEvents.length === 0) {
    if (importSection) importSection.style.display = 'block';
    importResultsEl.innerHTML = '<p class="placeholder">No events found in the uploaded file.</p>';
    return;
  }

  // Convert extracted events to no_match MatchResults so we can reuse
  // the match card UI with calendar picker and add-to-calendar buttons
  const asMatchResults: MatchResult[] = actionableEvents.map(event => ({
    extracted_event: event,
    match_type: 'no_match' as const,
    match_data: {
      match_type: 'no_match' as const,
      matched_event: null,
      matched_event_id: null,
    },
  }));
  lastMatchResults = asMatchResults;

  if (importSection) {
    importSection.style.display = 'block';
    // Hide the section header — import view renders its own via displayMatchResults
    const h2 = importSection.querySelector('h2');
    if (h2) h2.style.display = 'none';
  }

  // Temporarily swap the target container to render in the import view
  const origMatchedResults = matchedResultsEl;
  const origMatchedSection = matchedSection;
  matchedResultsEl = importResultsEl;
  matchedSection = importSection;

  displayMatchResults(asMatchResults, true);

  matchedResultsEl = origMatchedResults;
  matchedSection = origMatchedSection;

  // Auto-categorize when > 20 events
  if (actionableEvents.length > 20) {
    triggerAutoCategorization('import');
  }
}

// ============ Calendar Agent Handlers ============

/**
 * Listen for progress updates from the background script.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CALENDAR_AGENT_PROGRESS') {
    updateAgentProgress(message.progress);
  }
});

async function handleAgentStart(): Promise<void> {
  if (agentRunning) return;

  agentRunning = true;
  if (agentStartBtn) agentStartBtn.style.display = 'none';
  if (agentStopBtn) agentStopBtn.style.display = 'block';
  if (agentProgressSection) agentProgressSection.style.display = 'block';
  if (agentResultsSection) agentResultsSection.style.display = 'none';
  if (agentPlanStepsEl) agentPlanStepsEl.innerHTML = '';
  if (agentUnknownPlatformNotice) agentUnknownPlatformNotice.style.display = 'none';
  agentPageUrl = null;
  agentPageUrlSubmitted = false;
  if (agentStatusEl) {
    agentStatusEl.textContent = 'Running...';
    agentStatusEl.className = 'status status-extracting';
  }

  try {
    // Request host permission for the active tab's origin (requires user gesture)
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[CA:sidepanel] Active tab:', activeTab?.id, activeTab?.url);
    if (activeTab?.url && (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://'))) {
      const origin = new URL(activeTab.url).origin + '/*';
      const hasPermission = await chrome.permissions.contains({ origins: [origin] });
      console.log(`[CA:sidepanel] Permission for ${origin}: ${hasPermission}`);
      if (!hasPermission) {
        console.log(`[CA:sidepanel] Requesting permission for ${origin}...`);
        const granted = await chrome.permissions.request({ origins: [origin] });
        console.log(`[CA:sidepanel] Permission granted: ${granted}`);
        if (!granted) {
          throw new Error('Permission to access this site was denied. The calendar agent needs access to read the page content.');
        }
      }
    } else {
      console.log('[CA:sidepanel] No valid URL on active tab, skipping permission request');
    }

    const provider = await getAIProvider();
    const apiKey = provider === 'gemini_key' ? await getGeminiKey() : undefined;

    const response = await chrome.runtime.sendMessage({
      type: 'START_CALENDAR_AGENT',
      apiKey: apiKey || undefined,
      provider,
    });

    agentRunning = false;

    if (response.success && response.events) {
      const events: ExtractedEvent[] = response.events;
      if (events.length === 0) {
        if (agentStatusEl) {
          agentStatusEl.textContent = 'No events found';
          agentStatusEl.className = 'status status-idle';
        }
        showAgentError('No calendar events were found on this page. Try navigating to a page with a calendar or event listing.');
      } else {
        if (agentStatusEl) {
          agentStatusEl.textContent = 'Matching against your calendar...';
          agentStatusEl.className = 'status status-extracting';
        }
        await displayAgentResults(events);
        if (agentStatusEl) {
          agentStatusEl.textContent = `Complete — ${events.length} events found`;
          agentStatusEl.className = 'status status-complete';
        }
      }
    } else {
      const rawError = response.error || 'Agent finished with errors';
      const friendlyMsg = mapAgentErrorToFriendly(rawError);
      if (agentStatusEl) {
        agentStatusEl.textContent = 'Extraction failed';
        agentStatusEl.className = 'status status-error';
      }
      showAgentError(friendlyMsg);
    }
  } catch (e) {
    agentRunning = false;
    const rawError = (e as Error).message;
    const friendlyMsg = mapAgentErrorToFriendly(rawError);
    if (agentStatusEl) {
      agentStatusEl.textContent = 'Extraction failed';
      agentStatusEl.className = 'status status-error';
    }
    showAgentError(friendlyMsg);
  }

  if (agentStartBtn) {
    agentStartBtn.style.display = 'block';
    agentStartBtn.textContent = 'Extract Again';
  }
  if (agentStopBtn) agentStopBtn.style.display = 'none';
  const instrEl = document.getElementById('agent-instruction');
  if (instrEl) instrEl.style.display = 'block';
}

function showAgentError(message: string): void {
  const banner = document.getElementById('agent-error-banner');
  const msgEl = document.getElementById('agent-error-message');
  if (banner && msgEl) {
    msgEl.textContent = message;
    banner.classList.add('visible');
  }
}

function mapAgentErrorToFriendly(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('permission') && (lower.includes('denied') || lower.includes('was denied'))) {
    return 'This page requires permission to access. Please try again and grant access when prompted.';
  }
  if (lower.includes('not fully loaded') || lower.includes('not.*loaded') || lower.includes('no tab')) {
    return 'The page doesn\'t appear to be fully loaded. Please wait for it to load and try again.';
  }
  if (lower.includes('inject') || lower.includes('cannot access') || lower.includes('chrome://') || lower.includes('chrome-extension://')) {
    return 'This page can\'t be accessed by the extension. Try navigating to a regular webpage with calendar events.';
  }
  if (lower.includes('timeout')) {
    return 'The extraction timed out. The page may be too complex. Try a different page or use the Import option.';
  }
  return error;
}

function handleAgentStop(): void {
  chrome.runtime.sendMessage({ type: 'STOP_CALENDAR_AGENT' });
  agentRunning = false;
  if (agentStartBtn) agentStartBtn.style.display = 'block';
  if (agentStopBtn) agentStopBtn.style.display = 'none';
  if (agentStatusEl) {
    agentStatusEl.textContent = 'Stopped by user';
    agentStatusEl.className = 'status status-idle';
  }
}

async function handleSubmitPageUrl(e: Event): Promise<void> {
  e.preventDefault();

  const link = document.getElementById('agent-submit-url-link');
  if (!agentPageUrl || agentPageUrlSubmitted) return;

  if (link) link.textContent = 'Sending...';

  try {
    const token = await getCalendarToken();
    const response = await fetch('https://tryambientai.com/extension_endpoint/submit_page_url/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: agentPageUrl,
        page_title: document.title || '',
      }),
    });

    if (response.ok) {
      agentPageUrlSubmitted = true;
      if (link) {
        const parent = link.parentElement;
        if (parent) {
          parent.innerHTML = 'URL sent — thanks! We\'ll use this to improve extraction for this site.';
        }
      }
    } else {
      if (link) link.textContent = 'send this page\'s URL to Ambient';
    }
  } catch {
    if (link) link.textContent = 'send this page\'s URL to Ambient';
  }
}

// ============ Filter Handlers ============

async function handleFilterClick(): Promise<void> {
  const filterBtn = document.getElementById('agent-filter-btn') as HTMLButtonElement | null;
  const dropdown = document.getElementById('agent-filter-dropdown');
  if (!filterBtn || !dropdown) return;

  // If categories already loaded, toggle dropdown visibility
  if (filterCategories.length > 0) {
    const isVisible = dropdown.style.display !== 'none';
    if (isVisible) {
      dropdown.style.display = 'none';
      filterBtn.classList.remove('active');
    } else {
      dropdown.style.display = 'flex';
      filterBtn.classList.add('active');
    }
    return;
  }

  // First time: call LLM to categorize
  if (filterEventsSource.length === 0) return;

  filterBtn.disabled = true;
  filterBtn.classList.add('loading');
  filterBtn.innerHTML = `<span class="btn-spinner"></span> Categorizing...`;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CATEGORIZE_EVENTS',
      events: filterEventsSource,
    });

    if (!response.success) {
      throw new Error(response.error || 'Categorization failed');
    }

    filterCategories = response.categories as EventCategory[];
    activeFilterIds.clear();

    renderFilterDropdown(dropdown);
    dropdown.style.display = 'flex';
    filterBtn.classList.add('active');
    filterBtn.classList.remove('loading');
    filterBtn.disabled = false;
    filterBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Filter`;

    // Apply color dots to cards
    applyFilterColorsToCards();
  } catch (e) {
    console.error('[Ambient] Categorization error:', e);
    filterBtn.disabled = false;
    filterBtn.classList.remove('loading');
    filterBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Filter`;
  }
}

const FIXED_PRIORITY_LABELS = [
  'days off / early dismissal',
  'first & last days',
  'parent attendance expected',
];

function isPriorityCategory(label: string): boolean {
  const lower = label.toLowerCase();
  if (lower.startsWith('school:')) return true;
  return FIXED_PRIORITY_LABELS.some(p => lower.includes(p.split('/')[0].trim().slice(0, 8)));
}

function renderCategoryRow(cat: { id: string; label: string; color: string; eventIndices: number[] }): string {
  const isSelected = activeFilterIds.has(cat.id);
  const count = cat.eventIndices.length;
  const dimmed = count === 0 ? ' filter-category-empty' : '';
  return `<div class="filter-category ${isSelected ? 'selected' : ''}${dimmed}" data-cat-id="${cat.id}">
    <span class="filter-category-check" style="background: ${isSelected ? cat.color : 'transparent'}; border-color: ${isSelected ? 'transparent' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </span>
    <span class="filter-category-swatch" style="background: ${cat.color}"></span>
    <span class="filter-category-label">${escapeHtml(cat.label)}</span>
    <span class="filter-category-count">${count}</span>
  </div>`;
}

function renderFilterDropdown(container: HTMLElement): void {
  const FIXED_PRIORITY_COLORS = ['#e53e3e', '#7877c6', '#ed8936'];
  const SCHOOL_COLOR = '#38a169';

  const priorityCats: Array<{ id: string; label: string; color: string; eventIndices: number[] }> = [];
  const schoolCats: typeof priorityCats = [];
  const otherCats: typeof priorityCats = [];

  for (const cat of filterCategories) {
    const lower = cat.label.toLowerCase();
    if (lower.startsWith('school:')) {
      schoolCats.push(cat);
    } else if (FIXED_PRIORITY_LABELS.some(p => lower.includes(p.split('/')[0].trim().slice(0, 8)))) {
      priorityCats.push(cat);
    } else {
      otherCats.push(cat);
    }
  }

  // Ensure the 3 fixed priority categories always exist
  const defaultPriorityLabels = ['Days Off / Early Dismissal', 'First & Last Days', 'Parent Attendance Expected'];
  for (let i = 0; i < defaultPriorityLabels.length; i++) {
    const label = defaultPriorityLabels[i];
    const prefix = FIXED_PRIORITY_LABELS[i].split('/')[0].trim().slice(0, 8);
    const exists = priorityCats.some(c => c.label.toLowerCase().includes(prefix));
    if (!exists) {
      priorityCats.splice(i, 0, {
        id: `priority_stub_${i}`,
        label,
        color: FIXED_PRIORITY_COLORS[i],
        eventIndices: [],
      });
    }
  }

  // Sort fixed priorities to match the default order
  priorityCats.sort((a, b) => {
    const aIdx = defaultPriorityLabels.findIndex(l => a.label.toLowerCase().includes(l.toLowerCase().slice(0, 8)));
    const bIdx = defaultPriorityLabels.findIndex(l => b.label.toLowerCase().includes(l.toLowerCase().slice(0, 8)));
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  // Assign green shades to school categories if they don't have a good color yet
  schoolCats.forEach((cat, i) => {
    const greens = ['#38a169', '#2f855a', '#276749', '#48bb78'];
    cat.color = greens[i % greens.length];
  });

  let html = '<div class="filter-dropdown-body">';
  for (const cat of priorityCats) html += renderCategoryRow(cat);
  if (schoolCats.length > 0) {
    html += '<div class="filter-divider"></div>';
    for (const cat of schoolCats) html += renderCategoryRow(cat);
  }
  if (otherCats.length > 0) {
    html += '<div class="filter-divider"></div>';
    for (const cat of otherCats) html += renderCategoryRow(cat);
  }
  html += '</div>';

  html += `<div class="filter-actions">
    <button class="filter-action-btn" data-action="select-all">Select All</button>
    <button class="filter-action-btn" data-action="clear-all">Clear All</button>
    <button class="filter-action-btn filter-apply-btn" data-action="apply">Apply</button>
  </div>`;
  container.innerHTML = html;

  // Category click handlers
  container.querySelectorAll('.filter-category').forEach(el => {
    el.addEventListener('click', () => {
      const catId = (el as HTMLElement).dataset.catId;
      if (!catId) return;
      if (activeFilterIds.has(catId)) {
        activeFilterIds.delete(catId);
      } else {
        activeFilterIds.add(catId);
      }
      renderFilterDropdown(container);
      applyActiveFilters();
    });
  });

  // Select All / Clear All / Apply
  container.querySelectorAll('.filter-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'select-all') {
        filterCategories.forEach(c => activeFilterIds.add(c.id));
        renderFilterDropdown(container);
        applyActiveFilters();
      } else if (action === 'clear-all') {
        activeFilterIds.clear();
        renderFilterDropdown(container);
        applyActiveFilters();
      } else if (action === 'apply') {
        container.style.display = 'none';
        const filterBtn = document.getElementById('agent-filter-btn');
        if (filterBtn) filterBtn.classList.remove('active');
      }
    });
  });
}

/**
 * Auto-trigger categorization for large event sets (>20).
 * Pre-selects priority categories after completion.
 */
async function triggerAutoCategorization(viewPrefix: 'agent' | 'import'): Promise<void> {
  const filterBtn = document.getElementById(`${viewPrefix}-filter-btn`) as HTMLButtonElement | null;
  const dropdown = document.getElementById(`${viewPrefix}-filter-dropdown`);

  if (!filterBtn || !dropdown || filterEventsSource.length === 0) return;

  filterBtn.disabled = true;
  filterBtn.classList.add('loading');
  filterBtn.innerHTML = `<span class="btn-spinner"></span> Categorizing...`;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CATEGORIZE_EVENTS',
      events: filterEventsSource,
    });

    if (!response.success) throw new Error(response.error || 'Categorization failed');

    filterCategories = response.categories as EventCategory[];
    activeFilterIds.clear();

    // Pre-select priority categories
    for (const cat of filterCategories) {
      if (isPriorityCategory(cat.label)) {
        activeFilterIds.add(cat.id);
      }
    }

    renderFilterDropdown(dropdown);
    dropdown.style.display = 'flex';
    filterBtn.classList.add('active');
    filterBtn.classList.remove('loading');
    filterBtn.disabled = false;
    filterBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Filter`;

    applyFilterColorsToCards();

    // Apply filter if priority categories were selected
    if (activeFilterIds.size > 0) {
      applyActiveFilters();
    }
  } catch (e) {
    console.error('[Ambient] Auto-categorization error:', e);
    filterBtn.disabled = false;
    filterBtn.classList.remove('loading');
    filterBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Filter`;
  }
}

function applyFilterColorsToCards(): void {
  if (!agentResultsList) return;

  // Build index -> categories mapping (an event can belong to multiple)
  const indexToCategories = new Map<number, EventCategory[]>();
  for (const cat of filterCategories) {
    for (const idx of cat.eventIndices) {
      const list = indexToCategories.get(idx) || [];
      list.push(cat);
      indexToCategories.set(idx, list);
    }
  }

  const cards = agentResultsList.querySelectorAll('.match-card[data-card-id]');
  cards.forEach(card => {
    const cardId = (card as HTMLElement).dataset.cardId;
    if (!cardId) return;
    const match = cardId.match(/^no_match_(\d+)$/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    const cats = indexToCategories.get(idx);
    if (!cats || cats.length === 0) return;

    // Store all category IDs as comma-separated for filter matching
    (card as HTMLElement).dataset.filterCatIds = cats.map(c => c.id).join(',');

    const summaryEl = card.querySelector('.match-summary');
    if (summaryEl && !summaryEl.querySelector('.filter-color-dot')) {
      // Show a dot for each category (priority categories first)
      const sorted = [...cats].sort((a, b) => {
        const aP = isPriorityCategory(a.label) ? 0 : 1;
        const bP = isPriorityCategory(b.label) ? 0 : 1;
        return aP - bP;
      });
      for (let i = sorted.length - 1; i >= 0; i--) {
        const dot = document.createElement('span');
        dot.className = 'filter-color-dot';
        dot.style.backgroundColor = sorted[i].color;
        dot.title = sorted[i].label;
        summaryEl.insertBefore(dot, summaryEl.firstChild);
      }
    }
  });
}

function applyActiveFilters(): void {
  if (!agentResultsList) return;

  const hasActiveFilters = activeFilterIds.size > 0;

  // Show/hide cards based on whether any of the card's categories are active
  const cards = agentResultsList.querySelectorAll('.match-card[data-card-id]');
  let visibleCount = 0;
  cards.forEach(card => {
    const el = card as HTMLElement;
    const cardId = el.dataset.cardId;
    if (!cardId) return;
    const match = cardId.match(/^no_match_(\d+)$/);
    if (!match) return;

    if (!hasActiveFilters) {
      el.classList.remove('filter-hidden');
      visibleCount++;
      return;
    }

    const catIds = (el.dataset.filterCatIds || '').split(',').filter(Boolean);
    const matches = catIds.some(id => activeFilterIds.has(id));
    if (matches) {
      el.classList.remove('filter-hidden');
      visibleCount++;
    } else {
      el.classList.add('filter-hidden');
    }
  });

  // Update the section header count
  const sectionHeaders = agentResultsList.querySelectorAll('.match-section-header');
  sectionHeaders.forEach(header => {
    const text = header.textContent || '';
    if (text.startsWith('New Events')) {
      const total = cards.length;
      if (hasActiveFilters) {
        header.textContent = `New Events (${visibleCount} of ${total})`;
      } else {
        header.textContent = `New Events (${total})`;
      }
    }
  });

  // Update "Add All" button text
  const addAllBtns = agentResultsList.querySelectorAll('.add-all-btn');
  addAllBtns.forEach(btn => {
    if (hasActiveFilters) {
      (btn as HTMLButtonElement).textContent = `Add All (${visibleCount})`;
    } else {
      (btn as HTMLButtonElement).textContent = 'Add All';
    }
  });
}

function updateAgentProgress(progress: {
  phase: string;
  iterationCount: number;
  maxIterations: number;
  eventsFound: number;
  dateRangeCovered: { earliest: string; latest: string } | null;
  currentAction: string;
  activityLog: string[];
  planSteps?: Array<{
    id: string;
    label: string;
    status: string;
    subSteps: Array<{ message: string; timestamp: string }>;
    result?: string;
  }>;
  unknownPlatformNotice?: boolean;
  pageUrl?: string;
}): void {
  if (agentPhaseEl) agentPhaseEl.textContent = progress.phase;
  if (agentIterationEl) agentIterationEl.textContent = `${progress.iterationCount} / ${progress.maxIterations}`;

  if (agentEventsCountEl) agentEventsCountEl.textContent = String(progress.eventsFound);
  if (agentDateRangeEl) {
    if (progress.dateRangeCovered) {
      agentDateRangeEl.textContent = `${progress.dateRangeCovered.earliest} — ${progress.dateRangeCovered.latest}`;
    } else {
      agentDateRangeEl.textContent = '--';
    }
  }

  if (agentUnknownPlatformNotice) {
    agentUnknownPlatformNotice.style.display = progress.unknownPlatformNotice ? 'block' : 'none';
  }

  if (progress.pageUrl) {
    agentPageUrl = progress.pageUrl;
  }

  if (agentPlanStepsEl && progress.planSteps && progress.planSteps.length > 0) {
    renderPlanSteps(progress.planSteps);
  }

  // Update agent activity log
  const agentLogEl = document.getElementById('agent-log');
  if (agentLogEl && progress.activityLog && progress.activityLog.length > 0) {
    agentLogEl.innerHTML = progress.activityLog
      .map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`)
      .join('');
    agentLogEl.scrollTop = agentLogEl.scrollHeight;
  }
}

function renderPlanSteps(steps: Array<{
  id: string;
  label: string;
  status: string;
  subSteps: Array<{ message: string; timestamp: string }>;
  result?: string;
}>): void {
  if (!agentPlanStepsEl) return;

  const html = steps.map(step => {
    const statusIcon = getPlanStepIcon(step.status);
    const statusClass = `plan-step-${step.status}`;
    const isExpanded = step.status === 'active' || (step.status === 'completed' && step.subSteps.length > 0);

    let stepHtml = `<div class="plan-step ${statusClass}" data-step-id="${step.id}">`;
    stepHtml += `<div class="plan-step-header">`;
    stepHtml += `<span class="plan-step-icon">${statusIcon}</span>`;
    stepHtml += `<span class="plan-step-label">${escapeHtml(step.label)}</span>`;
    if (step.result && step.status !== 'active') {
      stepHtml += `<span class="plan-step-result">${escapeHtml(step.result)}</span>`;
    }
    stepHtml += `</div>`;

    if (step.subSteps.length > 0) {
      const subStepsClass = isExpanded ? 'plan-substeps expanded' : 'plan-substeps';
      stepHtml += `<div class="${subStepsClass}">`;
      for (const sub of step.subSteps) {
        stepHtml += `<div class="plan-substep">`;
        stepHtml += `<span class="plan-substep-time">${escapeHtml(sub.timestamp)}</span>`;
        stepHtml += `<span class="plan-substep-msg">${escapeHtml(sub.message)}</span>`;
        stepHtml += `</div>`;
      }
      stepHtml += `</div>`;
    }

    stepHtml += `</div>`;
    return stepHtml;
  }).join('');

  agentPlanStepsEl.innerHTML = html;

  // Auto-scroll to the active step
  const activeStep = agentPlanStepsEl.querySelector('.plan-step-active');
  if (activeStep) {
    activeStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function getPlanStepIcon(status: string): string {
  switch (status) {
    case 'completed': return '<svg class="plan-icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    case 'active': return '<span class="plan-icon-spinner"></span>';
    case 'failed': return '<svg class="plan-icon-x" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    case 'skipped': return '<svg class="plan-icon-skip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    default: return '<span class="plan-icon-circle"></span>';
  }
}

/**
 * Deterministic calendar matching — no LLM calls.
 * Compares extracted events against Google Calendar using normalized
 * summary comparison and start-time tolerance.
 */
async function deterministicMatchEvents(
  extractedEvents: ExtractedEvent[]
): Promise<MatchResult[]> {
  const futureEvents = extractedEvents.filter(e => {
    const dt = e.start?.dateTime || e.start?.date;
    if (!dt) return true;
    return new Date(dt) >= new Date(new Date().toDateString());
  });

  if (futureEvents.length === 0) {
    return extractedEvents.map(e => ({
      extracted_event: e,
      match_type: 'no_match' as const,
      match_data: { match_type: 'no_match' as const, matched_event: null, matched_event_id: null },
    }));
  }

  const dates = futureEvents
    .map(e => e.start?.dateTime || e.start?.date || '')
    .filter(Boolean)
    .sort();

  const timeMin = dates.length > 0 ? new Date(dates[0]).toISOString() : new Date().toISOString();
  const lastDate = dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date();
  lastDate.setMonth(lastDate.getMonth() + 1);
  const timeMax = lastDate.toISOString();

  let calendarEvents: CalendarEvent[] = [];
  try {
    calendarEvents = await getEventsFromAllCalendars(timeMin, timeMax);
  } catch (e) {
    console.warn('[Ambient] Failed to fetch calendar events for matching:', e);
  }

  if (calendarEvents.length === 0) {
    return extractedEvents.map(e => ({
      extracted_event: e,
      match_type: 'no_match' as const,
      match_data: { match_type: 'no_match' as const, matched_event: null, matched_event_id: null },
    }));
  }

  return extractedEvents.map(extracted => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const extractedNorm = norm(extracted.summary || '');
    const extractedStart = extracted.start?.dateTime || extracted.start?.date || '';

    let bestMatch: CalendarEvent | null = null;
    let bestType: 'no_match' | 'no_update' | 'possible_update' = 'no_match';

    for (const cal of calendarEvents) {
      const calNorm = norm(cal.summary || '');
      const calStart = cal.start?.dateTime || cal.start?.date || '';

      if (!calStart || !extractedStart) continue;

      const timesMatch = startTimesMatch(extractedStart, calStart);
      if (!timesMatch) continue;

      if (extractedNorm === calNorm) {
        bestMatch = cal;
        bestType = 'no_update';
        break;
      }

      const dist = levenshtein(extractedNorm, calNorm);
      const maxLen = Math.max(extractedNorm.length, calNorm.length);
      if (maxLen > 0 && dist / maxLen <= 0.2) {
        bestMatch = cal;
        bestType = 'possible_update';
      }
    }

    if (bestMatch && bestType !== 'no_match') {
      const result: MatchResult = {
        extracted_event: extracted,
        match_type: bestType,
        match_data: {
          match_type: bestType,
          matched_event: bestMatch.summary || null,
          matched_event_id: bestMatch.id || null,
        },
        matched_calendar_event: bestMatch,
      };
      if (bestType === 'possible_update') {
        result.field_differences = buildFieldDifferences(extracted, bestMatch);
      }
      return result;
    }

    return {
      extracted_event: extracted,
      match_type: 'no_match' as const,
      match_data: { match_type: 'no_match' as const, matched_event: null, matched_event_id: null },
    };
  });
}

function startTimesMatch(a: string, b: string): boolean {
  if (a.length <= 10 && b.length <= 10) return a === b;
  try {
    const da = new Date(a);
    const db = new Date(b);
    if (a.length <= 10 || b.length <= 10) {
      return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
    }
    return Math.abs(da.getTime() - db.getTime()) <= 60_000;
  } catch {
    return a === b;
  }
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function buildFieldDifferences(extracted: ExtractedEvent, calendar: CalendarEvent): FieldDifferences {
  const diff: FieldDifferences = {};
  if (extracted.summary && calendar.summary && extracted.summary !== calendar.summary) {
    diff.summary = { old: calendar.summary, new: extracted.summary };
  }
  if (extracted.location && calendar.location && extracted.location !== calendar.location) {
    diff.location = { old: calendar.location, new: extracted.location };
  }
  return diff;
}

async function displayAgentResults(events: ExtractedEvent[]): Promise<void> {
  if (!agentResultsList || !agentResultsSection) return;

  const actionableEvents = events.filter(e => e.event_type !== 'not_an_event');

  // Reset filter state
  filterCategories = [];
  activeFilterIds.clear();
  filterEventsSource = actionableEvents;

  if (actionableEvents.length === 0) {
    agentResultsSection.style.display = 'block';
    agentResultsList.innerHTML = '<p class="placeholder">No calendar events found on this page.</p>';
    return;
  }

  // Run deterministic matching against user's Google Calendar
  let matchResults: MatchResult[];
  try {
    matchResults = await deterministicMatchEvents(actionableEvents);
  } catch (e) {
    console.warn('[Ambient] Deterministic matching failed, showing all as new:', e);
    matchResults = actionableEvents.map(event => ({
      extracted_event: event,
      match_type: 'no_match' as const,
      match_data: { match_type: 'no_match' as const, matched_event: null, matched_event_id: null },
    }));
  }

  lastMatchResults = matchResults;

  agentResultsSection.style.display = 'block';
  const h2 = agentResultsSection.querySelector('h2');
  if (h2) h2.style.display = 'none';

  const origMatchedResults = matchedResultsEl;
  const origMatchedSection = matchedSection;
  matchedResultsEl = agentResultsList;
  matchedSection = agentResultsSection;

  displayMatchResults(matchResults, true);

  matchedResultsEl = origMatchedResults;
  matchedSection = origMatchedSection;

  // Inject filter button into the calendar row (between select and Add All)
  if (actionableEvents.length > 1) {
    const calRow = agentResultsList.querySelector('.import-calendar-row');
    if (calRow) {
      const addAllBtn = calRow.querySelector('.add-all-btn');
      const filterBtn = document.createElement('button');
      filterBtn.id = 'agent-filter-btn';
      filterBtn.className = 'filter-btn';
      filterBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Filter`;
      if (addAllBtn) {
        calRow.insertBefore(filterBtn, addAllBtn);
      } else {
        calRow.appendChild(filterBtn);
      }
      filterBtn.addEventListener('click', handleFilterClick);

      const dropdown = document.createElement('div');
      dropdown.id = 'agent-filter-dropdown';
      dropdown.className = 'filter-dropdown';
      dropdown.style.display = 'none';
      calRow.parentElement!.insertBefore(dropdown, calRow.nextSibling);
    }
  }

  // Auto-categorize when > 20 events
  if (actionableEvents.length > 20) {
    triggerAutoCategorization('agent');
  }
}

