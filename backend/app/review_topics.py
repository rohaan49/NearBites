"""Small, reproducible multilabel review classifier trained on synthetic examples.

This is a demonstration model. Its held-out scores measure only the bundled
fictional examples, not performance on real customer language.
"""

from __future__ import annotations

import math
import random
import re
from collections import Counter
from functools import lru_cache

TOPICS = ("taste", "packaging", "delivery", "portion_value", "hygiene")
LABELS = {
    "taste": "Taste",
    "packaging": "Packaging",
    "delivery": "Delivery",
    "portion_value": "Portion and value",
    "hygiene": "Hygiene",
}

# Each sentence is fictional. Evaluation sentences are kept out of training.
TRAIN = {
    "taste": [
        "The biryani tasted rich and delicious", "The curry was far too salty", "I loved the spicy flavor",
        "The meal had no taste", "Fresh herbs made the food delicious", "The sauce was bland and watery",
        "I enjoyed the flavor of the nihari", "The daal was too spicy for me", "The chicken tasted smoky",
        "The food was flavorful and comforting", "The rice tasted burnt", "The seasoning was just right",
        "It tasted like a home cooked meal", "The soup was bland", "The spices had a lovely aroma",
        "The karahi flavor was disappointing", "Masala was balanced and tasty", "The dessert was too sweet",
        "The taste was excellent", "Good taste in every bite", "The taste was disappointing",
        "I liked the taste of the curry", "The taste was fresh and satisfying", "The food had a pleasant taste",
        "Home cooking gave the dish a comforting flavor", "The homemade meal tasted great", "I enjoyed the spices in this dish",
        "The spice level was perfect", "The meal was enjoyable and tasty", "I disliked the sharp spice",
    ],
    "packaging": [
        "The container leaked into the bag", "Food came in a sturdy sealed box", "The lid was loose",
        "The curry spilled from its container", "Packaging kept everything neat", "The bag was torn",
        "The food box was crushed", "Everything was wrapped carefully", "The soup container was not sealed",
        "The paper bag was soaked", "The packaging was secure", "The box opened during transport",
        "The meal was packed nicely", "I found sauce outside the container", "The parcel seal was broken",
        "The foil wrap kept the meal intact", "The bag handle ripped", "The container was clean and sturdy",
        "The packaging was damaged", "Neat packaging protected the food", "Packaging needs improvement",
        "The packaging leaked badly", "I appreciated the secure packaging", "The packaging was poor",
        "The food was well packed", "Everything came carefully packed", "The dish was packed badly",
    ],
    "delivery": [
        "The rider arrived late", "My order arrived earlier than expected", "Delivery took over an hour",
        "The courier came quickly", "The order never reached my door", "The rider went to the wrong address",
        "Delivery was on time", "The food arrived after a long delay", "The driver found my house easily",
        "The courier called before arrival", "The order was delivered quickly", "I waited a long time for the rider",
        "The delivery arrived at the promised time", "The courier could not find the street", "Food reached me too late",
        "The rider handed the order over promptly", "The delivery route took too long", "The driver was punctual",
    ],
    "portion_value": [
        "The portion was generous for the price", "The serving was too small", "This meal was good value",
        "The price felt high for such little food", "There was enough food for two people", "I expected a larger serving",
        "The quantity was worth the cost", "The bowl was only half full", "The meal felt expensive",
        "A filling portion at a fair price", "The price did not match the quantity", "The serving size was excellent",
        "I received very little rice", "The portion was satisfying", "This was overpriced for one plate",
        "The amount of food was generous", "The plate seemed small for the money", "Affordable and filling meal",
    ],
    "hygiene": [
        "I found a hair in my food", "The preparation looked clean", "The food had a strange smell",
        "I saw dirt inside the container", "The meal seemed unhygienic", "The food looked safely prepared",
        "There was an insect in the dish", "The kitchen appeared clean", "I was worried about food safety",
        "The meal smelled spoiled", "I noticed a foreign object in the food", "The dish looked sanitary",
        "The food looked contaminated", "The cook handled food with dirty hands", "I found a small piece of plastic in the meal",
        "The kitchen seemed tidy and hygienic", "The meal raised a cleanliness concern", "The food appeared fresh and safe",
    ],
}

EVALUATION = {
    "taste": ["The gravy was delicious", "This dish had too much salt", "The flavor was dull", "The spices tasted wonderful", "I did not enjoy the sweetness"],
    "packaging": ["The box leaked on the way", "The lid stayed tightly closed", "The meal was wrapped poorly", "The bag arrived damaged", "Everything was packed safely"],
    "delivery": ["The rider was delayed", "My order reached me fast", "Delivery missed the stated time", "The courier got lost", "The food arrived promptly"],
    "portion_value": ["A tiny serving for this price", "The quantity was excellent", "This plate was worth the money", "I wanted more food for the cost", "The portion filled me up"],
    "hygiene": ["I noticed a hair on the rice", "The food did not look clean", "The kitchen looked sanitary", "I found an insect near the dish", "The meal smelled unsafe"],
}

TRAIN_MIXED = [
    ("Tasty curry but the box leaked", ("taste", "packaging")),
    ("The rider was late and the food tasted cold", ("delivery", "taste")),
    ("Generous serving but the container broke", ("portion_value", "packaging")),
    ("A hair in the meal and the curry tasted stale", ("hygiene", "taste")),
    ("Delivery was quick and the bag was sealed", ("delivery", "packaging")),
    ("The tiny portion arrived very late", ("portion_value", "delivery")),
    ("Great flavor and a filling portion", ("taste", "portion_value")),
    ("The container was dirty and leaked", ("hygiene", "packaging")),
    ("The food smelled spoiled and cost too much", ("hygiene", "portion_value")),
    ("The driver was punctual but the box was crushed", ("delivery", "packaging")),
    ("Great taste although the bag was damaged", ("taste", "packaging")),
    ("The packaging was neat and the serving was ample", ("packaging", "portion_value")),
    ("Late rider but a delicious tasting meal", ("delivery", "taste")),
    ("The taste was pleasant but the bowl was too small", ("taste", "portion_value")),
    ("A nice flavor despite the late delivery", ("taste", "delivery")),
    ("Packaging was secure and the courier arrived fast", ("packaging", "delivery")),
    ("The meal tasted good but had a hair in it", ("taste", "hygiene")),
    ("Food tasted stale and the box was leaking", ("taste", "packaging")),
    ("The portion was generous and packaging was tidy", ("portion_value", "packaging")),
    ("The dish tasted spicy and the amount was filling", ("taste", "portion_value")),
]
EVAL_MIXED = [
    ("Delicious food but the packaging leaked", ("taste", "packaging")),
    ("The driver was delayed and the portion was small", ("delivery", "portion_value")),
    ("I found a hair and the dish tasted bland", ("hygiene", "taste")),
    ("A generous plate in a damaged box", ("portion_value", "packaging")),
    ("The food seemed unsafe and arrived late", ("hygiene", "delivery")),
]

TOKEN = re.compile(r"[a-z]+")
STOP_WORDS = {"a", "an", "and", "as", "at", "be", "but", "by", "for", "from", "had", "has", "in", "is", "it", "my", "of", "on", "or", "the", "this", "to", "was", "were", "with", "demo", "review"}
DECISION_THRESHOLD = 0.5


def features(text: str) -> Counter[str]:
    words = [word for word in TOKEN.findall(text.lower()) if word not in STOP_WORDS]
    return Counter(words + [f"{a}_{b}" for a, b in zip(words, words[1:])])


def sigmoid(value: float) -> float:
    value = max(-35.0, min(35.0, value))
    return 1.0 / (1.0 + math.exp(-value))


class ReviewTopicModel:
    def __init__(self) -> None:
        train = [(text, (topic,)) for topic, texts in TRAIN.items() for text in texts] + TRAIN_MIXED
        evaluation = [(text, (topic,)) for topic, texts in EVALUATION.items() for text in texts] + EVAL_MIXED
        self.idf: dict[str, float] = {}
        counts = Counter(word for text, _ in train for word in features(text))
        self.idf = {word: math.log((1 + len(train)) / (1 + count)) + 1 for word, count in counts.items()}
        vectors = [self.vector(text) for text, _ in train]
        self.weights: dict[str, dict[str, float]] = {}
        self.biases: dict[str, float] = {}
        for topic in TOPICS:
            weights: dict[str, float] = {}
            bias = 0.0
            positives = sum(topic in labels for _, labels in train)
            positive_weight = (len(train) - positives) / positives
            indices = list(range(len(train)))
            rng = random.Random(40)
            for epoch in range(100):
                rng.shuffle(indices)
                rate = 0.45 / (1 + epoch * 0.025)
                for index in indices:
                    target = float(topic in train[index][1])
                    vector = vectors[index]
                    probability = sigmoid(bias + sum(weights.get(word, 0.0) * value for word, value in vector.items()))
                    error = (target - probability) * (positive_weight if target else 1.0)
                    bias += rate * error
                    for word, value in vector.items():
                        old = weights.get(word, 0.0)
                        weights[word] = old + rate * (error * value - 0.001 * old)
            self.weights[topic] = weights
            self.biases[topic] = bias
        self.evaluation = self.evaluate(evaluation)
        self.training_examples = len(train)
        self.evaluation_examples = len(evaluation)

    def vector(self, text: str) -> dict[str, float]:
        terms = features(text)
        vector = {word: count * self.idf[word] for word, count in terms.items() if word in self.idf}
        norm = math.sqrt(sum(value * value for value in vector.values()))
        return {word: value / norm for word, value in vector.items()} if norm else {}

    def predict(self, text: str) -> list[str]:
        if not text.strip():
            return []
        vector = self.vector(text)
        if not vector:
            return []
        return [topic for topic in TOPICS if sigmoid(self.biases[topic] + sum(self.weights[topic].get(word, 0.0) * value for word, value in vector.items())) >= DECISION_THRESHOLD]

    def evaluate(self, examples: list[tuple[str, tuple[str, ...]]]) -> list[dict]:
        rows = []
        for topic in TOPICS:
            tp = fp = fn = 0
            for text, truth in examples:
                predicted = topic in self.predict(text)
                actual = topic in truth
                tp += int(predicted and actual)
                fp += int(predicted and not actual)
                fn += int(not predicted and actual)
            precision = tp / (tp + fp) if tp + fp else 0.0
            recall = tp / (tp + fn) if tp + fn else 0.0
            rows.append({"topic": topic, "label": LABELS[topic], "precision": round(precision, 2), "recall": round(recall, 2), "f1": round(2 * precision * recall / (precision + recall), 2) if precision + recall else 0.0, "support": tp + fn})
        return rows


@lru_cache(maxsize=1)
def get_model() -> ReviewTopicModel:
    return ReviewTopicModel()
