# Model performance report

weights: `runs/baseline/weights/best.pt`
split: `test`  conf: 0.25  IoU match: 0.5

## Overall

| metric | value |
|---|---|
| precision | 0.8874 |
| recall | 0.8581 |
| mAP50 | 0.9027 |
| mAP50-95 | 0.5572 |

## Per class

| class | precision | recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| hairnet | 0.9073 | 0.9275 | 0.9449 | 0.5730 |
| glove | 0.8675 | 0.7887 | 0.8606 | 0.5414 |

## Error analysis

Annotated examples written to `reports/errors/<category>/` (green = ground truth, red = prediction).

| category | count |
|---|---|
| false_positive_hairnet | 811 |
| false_positive_glove | 714 |
| missed_glove | 403 |
| missed_hairnet | 170 |
| misclassified | 8 |

## Confusion matrix

`reports/val/confusion_matrix_normalized.png`
