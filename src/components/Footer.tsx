import { FC } from 'react';

export const Footer: FC = () => {
    const images = [
        "https://solassets.pages.dev/imgs/1.png",
    ];

    return (
        <div className="footer-container w-full overflow-hidden -mt-4">
            <div className="slider">
                <div className="slide-track2">
                    {images.map((src, index) => (
                        <div className="slide" key={index}>
                            <img className="carouselIMG" src={src} alt={`img-${index}`} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
