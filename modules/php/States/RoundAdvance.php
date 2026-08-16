<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\Scoop\Game;

/**
 * After every player has readied: bump the round or end the game.
 */
class RoundAdvance extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 97,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        return $this->game->advanceAfterRoundConfirm();
    }
}
