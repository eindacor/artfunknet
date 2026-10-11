"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import styles from "./tutorial-dialog.module.css";

const SLIDE_COUNT = 5;

export default function TutorialDialog({
  onClose,
}: {
  onClose: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function requestClose() {
    if (closing) return;
    setClosing(true);
    setError("");
    try {
      await onClose();
    } catch (closeError) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : "The tutorial completion could not be saved.",
      );
      setClosing(false);
    }
  }

  return (
    <dialog
      aria-describedby="tutorial-slide-description"
      aria-labelledby="tutorial-slide-title"
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        void requestClose();
      }}
      ref={dialogRef}
    >
      <div className={styles.content}>
        <button
          aria-label="Close tutorial"
          className={styles.close}
          disabled={closing}
          onClick={() => void requestClose()}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-times" />
        </button>

        <p className={styles.kicker}>
          How to play · {slideIndex + 1} of {SLIDE_COUNT}
        </p>
        <Slide index={slideIndex} />

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          {slideIndex > 0 ? (
            <button
              disabled={closing}
              onClick={() => {
                setError("");
                setSlideIndex((current) => current - 1);
              }}
              type="button"
            >
              Back
            </button>
          ) : null}
          {slideIndex < SLIDE_COUNT - 1 ? (
            <>
              <button
                className={styles.primary}
                disabled={closing}
                onClick={() => {
                  setError("");
                  setSlideIndex((current) => current + 1);
                }}
                type="button"
              >
                Next
              </button>
              <button
                disabled={closing}
                onClick={() => void requestClose()}
                type="button"
              >
                {closing ? "Saving..." : "Dismiss"}
              </button>
            </>
          ) : (
            <button
              className={styles.primary}
              disabled={closing}
              onClick={() => void requestClose()}
              type="button"
            >
              {closing ? "Saving..." : "OK"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Slide({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className={styles.slide}>
        <h2 id="tutorial-slide-title">
          Welcome to <BrandName />!!!
        </h2>
        <p id="tutorial-slide-description">
          It&apos;s an art collection game, here&apos;s how to play...
        </p>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className={styles.slide}>
        <h2 id="tutorial-slide-title">Find some artwork</h2>
        <p id="tutorial-slide-description">
          Go to the &quot;Offers&quot; section and open a crate of paintings.
          Select the ones you like and click on &quot;Add to collection&quot;
          to put them in your inventory.
        </p>
        <TutorialImage
          alt="The Add to collection button in the Offers section"
          height={1047}
          src="/img/tutorial/offers_add_button.png"
          width={1254}
        />
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className={styles.slide}>
        <h2 id="tutorial-slide-title">Add artwork to your gallery</h2>
        <p id="tutorial-slide-description">
          Go to the &quot;Home&quot; section where you&apos;ll find your
          inventory. Select the item you want to put on display and press the
          &quot;Display&quot; button. That puts the artwork you collected up in
          your gallery for other players to see!
        </p>
        <TutorialImage
          alt="The Display button for an inventory item"
          height={1588}
          src="/img/tutorial/inventory_display_button.png"
          width={1707}
        />
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className={styles.slide}>
        <h2 id="tutorial-slide-title">
          Visit galleries and meet gallery visitors
        </h2>
        <p id="tutorial-slide-description">
          Go to galleries on the &quot;Visit galleries&quot; page and click on any 
          visitor icons shown at the bottom. These visitors give different kinds
          of bonuses to help you build your collection and level up. The higher
          level you are, the more likely you are to find rare, valuable works!
        </p>
        <TutorialImage
          alt="Gallery visitor icons at the bottom of a player gallery"
          height={1246}
          src="/img/tutorial/gallery_visitors.png"
          width={1144}
        />
      </div>
    );
  }

  return (
    <div className={styles.slide}>
      <h2 id="tutorial-slide-title">Go forth and collect!</h2>
      <p id="tutorial-slide-description">
        This should be enough to get you started collecting, but there&apos;s a lot
        more to <BrandName />. To see this info again, click the ? button at the top of the page. 
        Feel free to explore the menus and stop by the{" "}
        <a
          href="https://discord.gg/wccww22yq"
          rel="noreferrer"
          target="_blank"
        >
          official Discord server
        </a>{" "}
        to say &quot;hi&quot; or ask any questions about the game!
      </p>
      <div className={styles.examples} aria-label="Example artwork cards">
        <TutorialImage
          alt="Example Artfunkel artwork card"
          height={355}
          src="/img/tutorial/example_00.png"
          width={499}
        />
        <TutorialImage
          alt="Example Artfunkel artwork card"
          height={607}
          src="/img/tutorial/example_01.png"
          width={462}
        />
        <TutorialImage
          alt="Example Artfunkel artwork card"
          height={643}
          src="/img/tutorial/example_02.png"
          width={502}
        />
      </div>
    </div>
  );
}

function BrandName() {
  return <span className={styles.brandName}>artfunkel</span>;
}

function TutorialImage({
  alt,
  height,
  src,
  width,
}: {
  alt: string;
  height: number;
  src: string;
  width: number;
}) {
  return (
    <Image
      alt={alt}
      className={styles.image}
      height={height}
      sizes="(max-width: 720px) calc(100vw - 72px), 700px"
      src={src}
      width={width}
    />
  );
}
