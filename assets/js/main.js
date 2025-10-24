let drill_scenarios;
fetch('./data/scenarios.json')
    .then(response => response.json())
    .then(data => {
        drill_scenarios = data.scenarios;
    })
    .catch(error => {
        console.error('Error loading scenarios.json:', error);
        // Fallback to hardcoded data
        window.drill_scenarios = getFallbackScenarios();
    });

let roles = null;
fetch('./data/roles.json')
    .then(response => response.json())
    .then(data => {
        roles = data.roles;
    })
    .catch(error => {
        console.error('Error loading roles.json:', error);
        // Fallback to hardcoded data
        roles = getFallbackRoles();
    });

let currentRoleIndex = 0;
let inSelectionMode = false;
let descPage = 0;

// --- Dialogue System State ---
let dialogueActive = false;
let currentScene = null;
let currentActionIndex = -1;
let typewriterTimeout = null;
let autoAdvanceTimeout = null;
let currentAudio = null;

const container = document.getElementById('container');
const roleButton = document.getElementById('role-button');
const roleImage = document.getElementById('role-image');
const arrowLeft = document.getElementById('arrow-left');
const arrowRight = document.getElementById('arrow-right');
const startDrillBtn = document.getElementById('start-drill-btn');
const backToHomeBtn = document.getElementById('back-to-home-btn');
const scenarioStartBtn = document.getElementById('scenario-start-btn');
const scenarioBox = document.getElementById('scenario-box');

const descriptionBox = document.getElementById('description-box');
const descriptionTextContainer = document.getElementById('description-text-container');
const descriptionTitle = document.getElementById('description-title');
const descriptionText = document.getElementById('description-text');
const descPrevBtn = document.getElementById('desc-prev-btn');
const descNextBtn = document.getElementById('desc-next-btn');

// Dialogue System Elements
const narrationBox = document.getElementById('narration-box');
const narrationTextP = document.getElementById('narration-text-p');
const characterDialogueContainer = document.getElementById('character-dialogue-container');
const dialogueCharacterImage = document.getElementById('dialogue-character-image');
const dialogueCharacterName = document.getElementById('dialogue-character-name');
const dialogueText = document.getElementById('dialogue-text');
const choiceContainer = document.getElementById('choice-container');
const typewriterSound = document.getElementById('typewriter-sound');


function checkDescOverflow() {
    descPage = 0;
    descriptionText.style.top = '0px';
    const scrollHeight = descriptionText.scrollHeight;
    const clientHeight = descriptionTextContainer.clientHeight;

    descPrevBtn.style.display = 'none';
    if (scrollHeight > clientHeight) {
        descNextBtn.style.display = 'block';
    } else {
        descNextBtn.style.display = 'none';
    }
}

function updateRoleDisplay() {
    if (!roles) return;
    const role = roles[currentRoleIndex];
    roleImage.src = role.hat_image;
    descriptionTitle.textContent = role.name;
    descriptionText.textContent = role.description;

    setTimeout(checkDescOverflow, 50);

    if (inSelectionMode) {
        roleButton.textContent = `確定選擇：${role.name}`;
    } else {
        roleButton.textContent = `選擇身分`;
    }
}

function changeRole(direction) {
    currentRoleIndex += direction;
    if (currentRoleIndex < 0) {
        currentRoleIndex = roles.length - 1;
    } else if (currentRoleIndex >= roles.length) {
        currentRoleIndex = 0;
    }
    updateRoleDisplay();
}

function scrollDescription(direction) {
    const contentHeight = descriptionText.scrollHeight;
    const boxHeight = descriptionTextContainer.clientHeight;
    const maxPages = Math.ceil(contentHeight / boxHeight);

    descPage += direction;

    if (descPage < 0) descPage = 0;
    if (descPage >= maxPages) descPage = maxPages - 1;

    descriptionText.style.top = `-${descPage * (boxHeight * 0.9)}px`;

    descPrevBtn.style.display = (descPage > 0) ? 'block' : 'none';
    descNextBtn.style.display = (descPage < maxPages - 1) ? 'block' : 'none';
}

function toggleSelectionMode() {
    inSelectionMode = !inSelectionMode;
    container.classList.toggle('selection-mode');
    updateRoleDisplay();
}

function startDrill() {
    container.classList.add('drill-mode');
}

function endDrill() {
    container.classList.remove('drill-mode');

    // Stop any ongoing dialogue
    if (typewriterTimeout) {
        clearTimeout(typewriterTimeout);
        typewriterTimeout = null;
    }
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
    typewriterSound.pause();
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    // Hide and reset all dialogue UI and state
    dialogueActive = false;
    currentScene = null;
    currentActionIndex = -1;
    hideAllDialogueUI();

    // Also ensure scenario box is reset for next run
    scenarioBox.style.opacity = '';
    scenarioBox.style.pointerEvents = '';
}

// --- Dialogue System Functions ---
function typewriter(element, text, callback) {
    let i = 0;
    element.textContent = '';
    const speed = 100; // Milliseconds per character

    if (typewriterTimeout) {
        clearTimeout(typewriterTimeout);
    }
    typewriterSound.currentTime = 0;
    typewriterSound.play();

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            typewriterTimeout = setTimeout(type, speed);
        } else {
            typewriterTimeout = null;
            typewriterSound.pause();
            if (callback) {
                callback();
            }
        }
    }
    type();
}

function hideAllDialogueUI() {
    narrationBox.style.opacity = '0';
    characterDialogueContainer.style.opacity = '0';
    choiceContainer.style.opacity = '0';
    narrationBox.style.pointerEvents = 'none';
    characterDialogueContainer.style.pointerEvents = 'none';
    choiceContainer.style.pointerEvents = 'none';
    typewriterSound.pause();
    if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
    }
}

function startDialogue() {
    dialogueActive = true;
    jumpToScene(1.1);
}

function jumpToScene(sceneId) {
    currentScene = drill_scenarios.find(s => s.id === sceneId);
    currentActionIndex = -1;
    processNextAction();
}

function showDialogue(text, imageUrl, roleName, onFinished) {
    hideAllDialogueUI();
    if (imageUrl) { // It's a character
        dialogueCharacterImage.src = imageUrl;
        dialogueCharacterName.textContent = roleName;
        characterDialogueContainer.style.opacity = '1';
        typewriter(dialogueText, text, onFinished);
    } else { // It's narration
        narrationBox.style.opacity = '1';
        typewriter(narrationTextP, text, onFinished);
    }
}

function processNextAction() {
    hideAllDialogueUI();
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    currentActionIndex++;
    if (!currentScene || currentActionIndex >= currentScene.action.length) {
        // Get all normal scenes (ID < 99) and sort them
        const normalScenes = drill_scenarios
            .filter(s => Math.floor(s.id) < 99)
            .sort((a, b) => a.id - b.id);

        // Find the index of the current scene in the sorted list
        const currentSceneIndexInNormalFlow = normalScenes.findIndex(s => s.id === currentScene.id);
        // Check if there is a next scene in the normal flow
        if (currentSceneIndexInNormalFlow !== -1 && currentSceneIndexInNormalFlow < normalScenes.length - 1) {
            const nextScene = normalScenes[currentSceneIndexInNormalFlow + 1];
            jumpToScene(nextScene.id);
        } else {
            // If no next normal scene, or if we were in a special scene (like 99.1), end the drill
            endDrill();
        }
        return;
    }

    const action = currentScene.action[currentActionIndex];

    if (action.audio) {
        currentAudio = new Audio(action.audio);
        currentAudio.play();
        if (action.audio_time) {
            setTimeout(() => {
                if (currentAudio) {
                    currentAudio.pause();
                }
            }, action.audio_time);
        }
    }

    // Determine image URL based on new 'image' property
    let imageUrl = null;
    if (action.rols !== '旁白') {
        const roleData = roles.find(r => r.name === action.rols);
        if (roleData) {
            imageUrl = (action.image === 1) ? roleData.hat_image : roleData.image;
        }
    }

    if (!action.action) { // Simple dialogue
        showDialogue(action.dialog, imageUrl, action.rols, () => {
            autoAdvanceTimeout = setTimeout(processNextAction, 1000);
        });

    } else { // Interactive choice
        const requiredRole = action.rols;
        const currentUserRole = roles[currentRoleIndex].name;

        if (requiredRole === currentUserRole) {
            // Player's turn to act: Type out the prompt, then show choices.
            const showChoices = () => {
                choiceContainer.innerHTML = ''; // Clear old choices
                const shuffledOptions = [...action.options];
                // Shuffle the copied array
                for (let i = shuffledOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
                }

                shuffledOptions.forEach(option => {
                    const button = document.createElement('button');
                    button.className = 'choice-button';
                    button.textContent = option.option;
                    button.onclick = () => {
                        const resultImageUrl = (action.image === 1) ? roles.find(r => r.name === action.rols).hat_image : roles.find(r => r.name === action.rols).image;
                        if (option.correct) {
                            showDialogue(option.dialog, resultImageUrl, action.rols, () => {
                                autoAdvanceTimeout = setTimeout(processNextAction, 1000);
                            });
                        } else {
                            showDialogue(action.fault_dialog, resultImageUrl, action.rols, () => {
                                autoAdvanceTimeout = setTimeout(() => jumpToScene(99.1), 1000);
                            });
                        }
                    };
                    choiceContainer.appendChild(button);
                });
                choiceContainer.style.opacity = '1';
                choiceContainer.style.pointerEvents = 'auto';
            };

            showDialogue(action.dialog || '...', imageUrl, action.rols, showChoices);

        } else {
            // AI's turn, auto-perform correct action
            const correctOption = action.options.find(opt => opt.correct === true);
            if (correctOption) {
                showDialogue(correctOption.dialog, imageUrl, action.rols, () => {
                    autoAdvanceTimeout = setTimeout(processNextAction, 1000);
                });
            } else {
                processNextAction(); // Failsafe
            }
        }
    }
}


roleButton.addEventListener('click', toggleSelectionMode);
arrowLeft.addEventListener('click', () => changeRole(-1));
arrowRight.addEventListener('click', () => changeRole(1));
descPrevBtn.addEventListener('click', () => scrollDescription(-1));
descNextBtn.addEventListener('click', () => scrollDescription(1));
startDrillBtn.addEventListener('click', startDrill);
backToHomeBtn.addEventListener('click', endDrill);

scenarioStartBtn.addEventListener('click', () => {
    scenarioBox.style.opacity = '0';
    scenarioBox.style.pointerEvents = 'none';
    setTimeout(startDialogue, 500); // Wait for scenario box animation to finish
});

// Initial setup
updateRoleDisplay();