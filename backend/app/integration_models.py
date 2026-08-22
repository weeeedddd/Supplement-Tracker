"""Strict request/response contracts for remote AI and store integrations."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

ShortText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
LongText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=1_200)
]
LanguageCode = Annotated[
    str, StringConstraints(pattern=r"^[a-z]{2}(?:-[A-Z]{2})?$", max_length=5)
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class RemoteAiConsent(StrictModel):
    share_profile_and_lifestyle: Literal[True]


class LifestyleContext(StrictModel):
    daily_routine: LongText
    work_pattern: Literal["mostly_seated", "mixed", "physically_active", "shift_work"]
    activity_level: Literal["low", "moderate", "high"]
    average_sleep_hours: float = Field(ge=2, le=14, allow_inf_nan=False)
    sleep_quality: Literal["poor", "mixed", "good"]
    meal_pattern: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=800)
    ]
    cooking_access: Literal["limited", "basic", "full"]
    stress_level: int = Field(ge=1, le=5)
    movement_constraints: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=500)
    ] = ""

    @field_validator("daily_routine", "meal_pattern", "movement_constraints")
    @classmethod
    def reject_control_characters(cls, value: str) -> str:
        if any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("control characters are not allowed")
        return value


class PlanDraftRequest(StrictModel):
    consent: RemoteAiConsent
    response_language: LanguageCode = "de"
    age: int = Field(ge=18, le=100)
    height_cm: float = Field(ge=120, le=230, allow_inf_nan=False)
    weight_kg: float = Field(ge=35, le=300, allow_inf_nan=False)
    goal: Literal[
        "healthy_routine", "general_fitness", "fat_loss", "muscle_gain", "performance"
    ]
    intensity: Literal["light", "medium", "hard"]
    training_experience: Literal["beginner", "intermediate", "advanced"]
    available_days_per_week: int = Field(ge=1, le=7)
    session_minutes: int = Field(ge=15, le=150)
    equipment: list[ShortText] = Field(min_length=0, max_length=12)
    dietary_preferences: list[ShortText] = Field(min_length=0, max_length=12)
    lifestyle: LifestyleContext

    @field_validator("equipment", "dietary_preferences")
    @classmethod
    def unique_case_insensitive(cls, values: list[str]) -> list[str]:
        normalized = [value.casefold() for value in values]
        if len(normalized) != len(set(normalized)):
            raise ValueError("duplicate entries are not allowed")
        return values


class DraftExercise(StrictModel):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)
    ]
    sets: int = Field(ge=1, le=6)
    reps_or_duration: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)
    ]
    effort_cue: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)
    ]
    equipment: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
    ]


class DraftTrainingDay(StrictModel):
    day_number: int = Field(ge=1, le=7)
    label: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)
    ]
    focus: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)
    ]
    duration_minutes: int = Field(ge=10, le=150)
    exercises: list[DraftExercise] = Field(min_length=1, max_length=8)


class DraftNutrition(StrictModel):
    calorie_target_kcal: int = Field(ge=1_200, le=5_000)
    protein_target_g: int = Field(ge=40, le=260)
    carbohydrate_target_g: int = Field(ge=50, le=650)
    fat_target_g: int = Field(ge=35, le=200)
    sugar_guidance: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=8, max_length=220)
    ]
    meal_principles: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=180)
        ]
    ] = Field(min_length=2, max_length=6)


class DraftRecovery(StrictModel):
    sleep_target_hours: float = Field(ge=7, le=10, allow_inf_nan=False)
    actions: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=180)
        ]
    ] = Field(min_length=2, max_length=6)


class PlanDraft(StrictModel):
    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=80)
    ]
    summary: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)
    ]
    training_days: list[DraftTrainingDay] = Field(min_length=1, max_length=7)
    nutrition: DraftNutrition
    recovery: DraftRecovery
    safety_notes: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=220)
        ]
    ] = Field(min_length=2, max_length=8)
    assumptions: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=180)
        ]
    ] = Field(min_length=1, max_length=8)


class PlanDraftEnvelope(StrictModel):
    provider: Literal["openai"]
    model: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    generated_at: Annotated[str, StringConstraints(min_length=20, max_length=40)]
    provider_storage_requested: Literal[False]
    draft: PlanDraft
    safety_disclaimer: Annotated[str, StringConstraints(min_length=20, max_length=300)]


class AssistantProfileContext(StrictModel):
    age: int = Field(ge=18, le=100)
    goal: Literal[
        "healthy_routine", "general_fitness", "fat_loss", "muscle_gain", "performance"
    ]
    activity_level: Literal["low", "moderate", "high"]
    average_sleep_hours: float = Field(ge=2, le=14, allow_inf_nan=False)
    dietary_preferences: list[ShortText] = Field(min_length=0, max_length=12)
    daily_routine_summary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=600)
    ] = ""


class AssistantPlanContext(StrictModel):
    plan_title: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=100)
    ] = ""
    training_summary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=600)
    ] = ""
    nutrition_summary: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=600)
    ] = ""
    calorie_target_kcal: int | None = Field(default=None, ge=1_200, le=5_000)
    protein_target_g: int | None = Field(default=None, ge=40, le=260)


class AssistantRespondRequest(StrictModel):
    consent_to_remote_ai: Literal[True]
    question: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=1_000)
    ]
    response_language: LanguageCode = "de"
    profile_context: AssistantProfileContext | None = None
    plan_context: AssistantPlanContext | None = None

    @field_validator("question")
    @classmethod
    def reject_question_control_characters(cls, value: str) -> str:
        if any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("control characters are not allowed")
        return value


class AssistantReply(StrictModel):
    answer: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=1_500)
    ]
    safety_notes: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=220)
        ]
    ] = Field(min_length=0, max_length=4)
    escalation: Literal["none", "routine_professional", "urgent"]


class AssistantReplyEnvelope(StrictModel):
    answer: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=1_500)
    ]
    safety_notes: list[
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=220)
        ]
    ] = Field(min_length=0, max_length=4)
    escalation: Literal["none", "routine_professional", "urgent"]
    provider: Literal["openai"]
    model: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    generated_at: Annotated[str, StringConstraints(min_length=20, max_length=40)]
    provider_storage_requested: Literal[False]


class Coordinates(StrictModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


StoreKind = Literal["grocery", "supplement"]


class NearbyStoresRequest(StrictModel):
    location_consent: Literal[True]
    country: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
    store_kind: StoreKind = "grocery"
    budget: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
    address: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)
        ]
        | None
    ) = None
    coordinates: Coordinates | None = None
    radius_meters: int = Field(default=5_000, ge=500, le=25_000)
    max_results: int = Field(default=10, ge=1, le=20)
    language_code: LanguageCode = "de"

    @model_validator(mode="after")
    def require_one_location_source(self) -> NearbyStoresRequest:
        if (self.address is None) == (self.coordinates is None):
            raise ValueError("provide exactly one of address or coordinates")
        return self


class StoreLocation(StrictModel):
    provider_id: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    name: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    formatted_address: Annotated[str, StringConstraints(max_length=300)]
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    distance_meters: int = Field(ge=0, le=100_000)
    maps_uri: Annotated[str, StringConstraints(max_length=1_024)]
    primary_type: Annotated[str, StringConstraints(max_length=80)]
    provider: Literal["google_maps"]


class BudgetContext(StrictModel):
    amount: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
    price_comparison_available: Literal[False]


class NearbyStoresEnvelope(StrictModel):
    provider: Literal["google_maps"]
    fetched_at: Annotated[str, StringConstraints(min_length=20, max_length=40)]
    location_source: Literal["address", "coordinates"]
    results: list[StoreLocation] = Field(max_length=20)
    budget_context: BudgetContext
    notice: Annotated[str, StringConstraints(min_length=20, max_length=300)]
