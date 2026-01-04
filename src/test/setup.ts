/**
 * Test setup file - initializes config directory before any tests run.
 * This is required because ConfigurationManager and ProjectManager
 * depend on getConfigDir() being initialized.
 */
import {initializeConfigDir} from '../utils/configDir.js';

// Initialize config directory for all tests
initializeConfigDir();
