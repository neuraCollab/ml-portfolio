"""Loads the pretrained SAC policy saved in models/ (see README) and runs a
single forward pass for a given observation.

The observation space the model was trained on is `{"image": 84x84x3 uint8,
"vector": 6-float32}` (see `KITTICarEnv` in anomaly_detection.py). We don't
have the raw KITTI dataset to build a real `KITTICarEnv`, so this module
only supports single-step inference on a caller-supplied observation -- it
does not re-create the environment or re-train anything.

`CustomCombinedExtractor` is copied verbatim from anomaly_detection.py: the
saved policy's pickled config references this exact class, so it must exist
under an importable path for `SAC.load()` to reconstruct the network.
"""
import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_model = None
_load_attempted = False
_load_error: str | None = None


def _build_custom_combined_extractor():
    import torch as th
    import torch.nn as nn
    from stable_baselines3.common.torch_layers import CombinedExtractor

    class CustomCombinedExtractor(CombinedExtractor):
        def __init__(self, observation_space):
            super().__init__(observation_space)
            self.extractors = th.nn.ModuleDict()
            self.extractors["image"] = nn.Sequential(
                nn.Conv2d(3, 32, kernel_size=8, stride=4),
                nn.ReLU(),
                nn.Conv2d(32, 64, kernel_size=4, stride=2),
                nn.ReLU(),
                nn.Conv2d(64, 64, kernel_size=3, stride=1),
                nn.ReLU(),
                nn.Flatten(),
                nn.Linear(3136, 512),
                nn.ReLU(),
            )
            self.extractors["vector"] = nn.Sequential(
                nn.Linear(observation_space["vector"].shape[0], 64),
                nn.ReLU(),
            )
            self._features_dim = 512 + 64

        def forward(self, observations):
            encoded_tensor_list = [
                extractor(observations[key]) for key, extractor in self.extractors.items()
            ]
            return th.cat(encoded_tensor_list, dim=1)

    return CustomCombinedExtractor


def load_policy(model_dir: Path):
    """Best-effort load of the pretrained SAC policy. Returns None (and logs
    why) if it can't be reconstructed -- callers must fall back gracefully,
    the model directory here holds raw torch state dicts + an SB3 version
    marker rather than a single `model.zip`, which is not SB3's normal
    `.load()` layout."""
    global _model, _load_attempted, _load_error
    if _load_attempted:
        return _model
    _load_attempted = True

    try:
        import torch
        from gymnasium import spaces
        from stable_baselines3 import SAC

        CustomCombinedExtractor = _build_custom_combined_extractor()

        # KITTICarEnv declared this as channels-last (84, 84, 3) -- the Gym
        # convention -- and relied on SB3's automatic VecTransposeImage
        # wrapping (applied when a real VecEnv is built during training) to
        # feed the CNN channels-first. We call the policy directly with no
        # VecEnv, so we transpose ourselves (see `predict()`) and declare
        # the space as already channels-first to match, rather than relying
        # on SB3's `predict()`-time auto-transpose heuristics, which are
        # built around a real VecEnv and misfire for a raw numpy dict here.
        observation_space = spaces.Dict(
            {
                "image": spaces.Box(low=0, high=255, shape=(3, 84, 84), dtype=np.uint8),
                "vector": spaces.Box(low=-np.inf, high=np.inf, shape=(6,), dtype=np.float32),
            }
        )
        action_space = spaces.Box(
            low=np.array([-1.0, 0.0, 0.0]), high=np.array([1.0, 1.0, 1.0]), dtype=np.float32
        )

        policy_path = model_dir / "policy.pth"
        if not policy_path.exists():
            raise FileNotFoundError(f"{policy_path} not found")

        sac = SAC(
            "MultiInputPolicy",
            env=None,
            policy_kwargs=dict(
                features_extractor_class=CustomCombinedExtractor,
                features_extractor_kwargs=dict(),
            ),
            _init_setup_model=False,
        )
        sac.observation_space = observation_space
        sac.action_space = action_space
        # BaseAlgorithm.__init__ normally sets n_envs from the env passed in,
        # and predict() reaches into self.env.action_space in one of its
        # code paths; with env=None (we only need this for inference, never
        # training) neither is ever set up. A minimal stand-in with just the
        # attributes predict() touches is enough -- SAC.predict() never calls
        # env.step()/reset(), only reads these two attributes off it.
        class _InferenceOnlyEnvStub:
            def __init__(self, action_space, num_envs=1):
                self.action_space = action_space
                self.num_envs = num_envs

        sac.n_envs = 1
        sac.env = _InferenceOnlyEnvStub(action_space)
        sac._setup_model()
        state_dict = torch.load(policy_path, map_location="cpu", weights_only=False)
        sac.policy.load_state_dict(state_dict)
        sac.policy.set_training_mode(False)
        _model = sac
        logger.info("Loaded pretrained SAC policy from %s", policy_path)
    except Exception as exc:  # pragma: no cover - best effort, logged for diagnosis
        _load_error = f"{type(exc).__name__}: {exc}"
        logger.warning("Could not load pretrained SAC policy, will use heuristic fallback: %s", _load_error)
        _model = None

    return _model


def get_load_error() -> str | None:
    return _load_error


def predict(model, image_84x84: np.ndarray, vector_state: np.ndarray) -> tuple[float, float, float]:
    """image_84x84 is HWC (84, 84, 3) uint8, transposed to CHW here to match
    `load_policy`'s channels-first observation_space -- SB3's `predict()`
    auto-transpose heuristics are built around a real VecEnv and gave a
    nonsensical Conv2d shape error for a raw one-off numpy dict, so this
    sidesteps them by keeping everything already in the shape the CNN and
    the declared observation_space agree on."""
    image_chw = np.transpose(image_84x84, (2, 0, 1)).astype(np.uint8)  # HWC -> CHW
    obs = {
        "image": image_chw[None, ...],
        "vector": vector_state[None, ...].astype(np.float32),
    }
    action, _ = model.predict(obs, deterministic=True)
    steering, throttle, brake = [float(v) for v in action[0]]
    return steering, throttle, brake


def heuristic_predict(speed: float, yaw_rate: float, nearest_obstacle_dist: float, lane_offset: float) -> tuple[float, float, float]:
    """Same shaping as the frontend's `predictPolicyAction()` mock, reimplemented
    in Python for the fallback path when the pretrained policy can't be loaded."""
    steering = max(-1.0, min(1.0, -lane_offset * 0.35))
    throttle = 0.65
    brake = 0.0
    if nearest_obstacle_dist < 7.0:
        throttle, brake = 0.0, 0.85
    elif nearest_obstacle_dist < 15.0:
        throttle, brake = 0.2, 0.3
    elif speed > 25:
        throttle = 0.4
    return round(steering, 2), round(throttle, 2), round(brake, 2)
