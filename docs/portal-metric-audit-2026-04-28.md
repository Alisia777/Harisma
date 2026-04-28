# Аудит метрик портала

Собрано: 28.04.2026, 10:41
Merged smart-price contour: 2026-04-28T07:40:04.042Z (28.04.2026, 10:40)

## Свежесть файлов

| Слой | generatedAt | asOf / rows |
| --- | --- | --- |
| prices | 2026-04-28T07:40:04.042Z (28.04.2026, 10:40) | — |
| workbench | 2026-04-24T11:44:22.557Z (24.04.2026, 14:44) | 2026-04-23 |
| overlay | 2026-04-28T07:40:04.042Z (28.04.2026, 10:40) | 2026-04-27 |
| live | 2026-04-16T23:59:00 (16.04.2026, 23:59) | — |
| dashboardLocal | 2026-04-28T07:40:42.433Z (28.04.2026, 10:40) | 2026-04-27 |
| dashboardStaged | 2026-04-28T07:00:36.346Z (28.04.2026, 10:00) | 2026-04-27 |
| trendsLocal | 2026-04-28T07:40:42.438Z (28.04.2026, 10:40) | 2026-04-27 |
| trendsStaged | 2026-04-28T07:00:36.356Z (28.04.2026, 10:00) | 2026-04-27 |
| repricerLocal | — | rows 0 |

## Покрытие метрик в merged-контуре

| Площадка | SKU | Последний факт | Цена | Цена клиента | SPP | Оборач. | Заказы 7д | Выручка 7д | Точки на последнюю дату | Заказы в последнюю дату | Выручка в последнюю дату |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WB | 239 | 2026-04-27 | 236 (98.7%) | 206 (86.2%) | 212 (88.7%) | 91 (38.1%) | 212 (88.7%) | 212 (88.7%) | 182 (76.2%) | 182 (76.2%) | 182 (76.2%) |
| Ozon | 291 | 2026-04-27 | 281 (96.6%) | 290 (99.7%) | 291 (100.0%) | 197 (67.7%) | 243 (83.5%) | 243 (83.5%) | 208 (71.5%) | 208 (71.5%) | 208 (71.5%) |
| Я.Маркет | 248 | 2026-04-27 | 248 (100.0%) | 248 (100.0%) | 248 (100.0%) | 0 (0.0%) | 202 (81.5%) | 202 (81.5%) | 74 (29.8%) | 74 (29.8%) | 74 (29.8%) |

## Примеры дыр по метрикам

### WB

- Без текущей цены: krem-filler_15ml, remuver_40ml, syvorotka_dlya_lica_30ml_v2
- Без цены клиента: fruitalica, krem-filler_15ml, remuver_40ml, retinol_full_journey, strong_hair, syvorotka_dlya_lica_30ml_v2
- Без SPP: artoks_75ml, dardrakona, dardrakona_75ml, harly_likvidator_500ml, khvoinitsa, khvoinitsa_1_1
- Без оборачиваемости: activeprost, allicil_gribok15ml, artoks, artoks_1_1, artoks_75ml, daoshen
- Без заказов за 7 дней: berberin_laif_bad_60caps, nabor_penka_dlya_resnic, b_kompleks_bad_60tabl, penka_160ml, gidrofilnoe_maslo_150ml, fruitalica
- Без выручки за 7 дней: berberin_laif_bad_60caps, nabor_penka_dlya_resnic, b_kompleks_bad_60tabl, penka_160ml, gidrofilnoe_maslo_150ml, fruitalica

### Ozon

- Без текущей цены: balzam_kudryavii_metod_500ml, biotrin_60ml, biotrin_60mlv1, mikardin plus_bad_60 caps, psoral11, remuver_40ml
- Без цены клиента: remuver_40ml
- Без SPP: нет
- Без оборачиваемости: harly_cat_premiumturkey_2kg, harly_cat_premiumveal_2kg, harly_cat_support_100tabs, harly_cat_teeth_bones_100tabs, harly_catshampoo_250ml, harly_dog_antiallergy_100tabs
- Без заказов за 7 дней: telomeras_60caps, syvorotka_dlya_rosta_6ml, relaksinol_bad_60caps, chudofrukt_bad_60caps, nabor_remuver_40ml_1_1, krem-filler_15ml
- Без выручки за 7 дней: telomeras_60caps, syvorotka_dlya_rosta_6ml, relaksinol_bad_60caps, chudofrukt_bad_60caps, nabor_remuver_40ml_1_1, krem-filler_15ml

### Я.Маркет

- Без текущей цены: нет
- Без цены клиента: нет
- Без SPP: нет
- Без оборачиваемости: т-34_bad_60caps, activeprost, adenofringreen, allicil_gribok15ml, alteya_beauty_brows_box, alteya_young_skin_box
- Без заказов за 7 дней: т-34_bad_60caps, alteya_beauty_brows_box, alteya_young_skin_box, arterol, biotrin, dardrakona_1_1
- Без выручки за 7 дней: т-34_bad_60caps, alteya_beauty_brows_box, alteya_young_skin_box, arterol, biotrin, dardrakona_1_1

## Межвкладочные риски

- data/repricer.json пустой; репрайсеру нельзя доверять этому файлу как самостоятельному источнику факт-метрик.
