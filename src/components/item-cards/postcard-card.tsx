import {
  ArtworkImage,
  AttributeIcons,
  ItemPropertyBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

function getConditionText(conditionVal: number) : string {
  if (conditionVal > .9) {
    return " excellent";
  } else if (conditionVal > .5) {
    return " good";
  } else {
    return " poor";
  }
}

// TODO AI let this fetch the actual item owner's name
function getPlayerName(owner_id: string) : string {
  return "Arthur Funkel";
}

export default function PostcardCard(props: ItemCardRendererProps) {
  const { item } = props;
  return (
    <div className="render-card postcard-card">
      <div className="postcard-card-front">
        <ArtworkImage className="postcard-card-image" item={item} />
        <span className="postcard-card-caption render-card-artist">
          Greetings from {item.artwork.artist}
        </span>
      </div>
      <div className="postcard-card-message">
        <div className="postcard-card-stamps">
          <AttributeIcons item={item} />
        </div>
        <p className="postcard-card-script">Wish you were here.</p>
        <h3>{item.artwork.title} ({item.artwork.date})</h3>
        <div className="postcard-card-message postcard-card-address-section">
          <p className="postcard-card-address">
            To: {getPlayerName(item.owner)}
          </p>
          <p className={item.lottery ? "postcard-card-address lottery-address" : "postcard-card-address"}>
            {item.level}{item.lottery} Stinkpot Junction, Appletown, AF 0671312
          </p>
        </div>
        <div className="postcard-card-properties">
          <p className="postcard-written-script">Hey buddy! This was made in {item.artwork.date}, 
            it's medium is {item.artwork.medium}. It's a level-{item.level}
            <span className="rarity-color"> {item.artwork.rarity}</span> work in 
            {item.mint ? <span className="mint-color"> mint</span> : getConditionText(item.condition)} condition and has an estimated value of
             <span className="value-text"> ${item.values.actual.toLocaleString()}</span>!
          </p>
        </div>
        {item.unlocked ? (
          <i
            aria-label="Unlocked"
            className="fa fa-unlock-alt postcard-card-unlocked"
          />
        ) : null}
      </div>
    </div>
  );
}
