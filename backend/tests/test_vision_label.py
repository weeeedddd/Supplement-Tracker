from app.services.vision import parse_nutrition_label_text


def test_parses_european_per_100g_label_without_inventing_missing_fields():
    result = parse_nutrition_label_text("""
        Nährwerte je 100 g
        Brennwert 420 kJ / 100 kcal
        Fett 2,5 g
        davon gesättigte Fettsäuren 0,4 g
        Kohlenhydrate 8,0 g
        davon Zucker 3,2 g
        Eiweiß 10,5 g
        Salz 0,50 g
    """)
    assert result["found"] is True
    assert result["basis"] == "per100g"
    assert result["values"]["kcal"] == 100
    assert result["values"]["prot"] == 10.5
    assert result["values"]["sodiumMg"] == 200
    assert result["confidence"] >= 80


def test_rejects_weak_ocr_instead_of_guessing():
    result = parse_nutrition_label_text("Protein bar delicious chocolate 50 g")
    assert result["found"] is False
    assert result["values"] == {}
