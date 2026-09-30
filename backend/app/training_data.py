"""Versioned curriculum; quiz answers stay on the server."""

MODULES = [
    {
        "id": "food-safety",
        "title": "Food Safety",
        "description": "Clean hands and surfaces, separate raw meat, and chill cooked food safely before pickup.",
        "steps": [
            "Wash hands before cooking and after handling raw meat. Clean counters, knives, and boards before they touch ready-to-eat food.",
            "Keep raw meat and its juices away from cooked food. Use separate utensils and covered containers.",
            "Cook food thoroughly and keep cooked food hot or refrigerate it promptly. Use safe water and fresh ingredients.",
            "Wear a clean hairnet and gloves for the camera proof. The camera only detects these items; an admin still checks the image.",
        ],
        "source_url": "https://www.who.int/activities/promoting-safe-food-handling/five-key-to-safer-food",
        "proof_instruction": "Use the camera to show your hairnet and gloves in one frame. An admin will review the captured image.",
        "questions": [
            {"q": "How should cooked salan be stored before pickup?", "options": ["Covered in the fridge", "Open on the counter", "In a warm oven all day"], "correct": 0},
            {"q": "When should you wash your hands?", "options": ["Before cooking and after handling raw meat", "Only at the end", "Once a day"], "correct": 0},
            {"q": "Where should raw chicken be kept?", "options": ["Separate from cooked food", "On the same tray", "Next to roti dough"], "correct": 0},
        ],
    },
    {
        "id": "packaging",
        "title": "Packaging",
        "description": "Seal liquids, separate components, and keep orders clean in transit.",
        "steps": [
            "Choose a clean, food-safe container that closes securely. Use a leak-proof box for salan or nihari.",
            "Pack rice, curry, chutney, and crisp items separately when mixing would spoil the meal.",
            "Seal the order and check that the lid, bag, and label stay intact during handover.",
        ],
        "proof_instruction": "Show a sealed, clean food container ready for pickup.",
        "questions": [
            {"q": "What container suits nihari?", "options": ["A leak-proof sealed box", "A thin plastic bag", "An open plate"], "correct": 0},
            {"q": "How should rice and salan be packed?", "options": ["Separately", "Mixed together", "In an open tray"], "correct": 0},
        ],
    },
    {
        "id": "allergens",
        "title": "Allergens",
        "description": "Declare ingredients and answer allergy questions accurately.",
        "steps": [
            "List the main ingredients and known allergens, including nuts, dairy, eggs, wheat, and sesame when used.",
            "Check sauces, garnish, and shared cooking equipment before answering an allergy question.",
            "If you cannot confirm an ingredient or avoid cross-contact, tell the buyer clearly before accepting the order.",
        ],
        "proof_instruction": "After passing the quiz, confirm that you understand how to declare known ingredients and allergens in each dish listing and answer buyers honestly.",
        "questions": [
            {"q": "What must a cashew korma declare?", "options": ["Nuts and dairy", "Nothing", "Only spice level"], "correct": 0},
            {"q": "What should you do when asked about allergens?", "options": ["Answer honestly and list ingredients", "Say you are unsure", "Ignore the question"], "correct": 0},
            {"q": "Where should allergens appear?", "options": ["In the listing description", "Nowhere", "Only when asked"], "correct": 0},
        ],
    },
    {
        "id": "portioning",
        "title": "Portion Sizing",
        "description": "Serve portions that match the amount promised in each listing.",
        "steps": [
            "Choose a consistent serving measure for each dish, such as a weighed rice portion or a measured curry ladle.",
            "Describe the portion honestly in your listing and use the same measure for every order.",
            "Reduce the available portion count as stock runs low; pause the dish instead of sending a smaller serving.",
        ],
        "proof_instruction": "Show a measured portion with a scale or measuring cup visible.",
        "questions": [
            {"q": "How much should a portion contain?", "options": ["The amount promised in the listing", "Whatever is left", "Half of the photo"], "correct": 0},
            {"q": "What should you do when portions run low?", "options": ["Update available portions", "Keep taking orders", "Send smaller plates"], "correct": 0},
        ],
    },
    {
        "id": "fulfilment",
        "title": "Order Fulfilment",
        "description": "Accept orders promptly, prepare them fresh, and hand them over on time.",
        "steps": [
            "Check new orders and accept only what you have ingredients and time to prepare.",
            "Update the order from accepted to cooking to ready as the food moves through your kitchen.",
            "Pack and hand over the right dishes on time. If you cannot fulfill an order, decline it promptly.",
        ],
        "proof_instruction": "Show an order packed and ready for dispatch or pickup.",
        "questions": [
            {"q": "What should you do with an order you cannot cook?", "options": ["Decline promptly", "Leave it pending", "Accept then cancel later"], "correct": 0},
            {"q": "How should food be handed over?", "options": ["Freshly packed and on time", "Whenever convenient", "Cold and pre-packed hours before"], "correct": 0},
        ],
    },
]
