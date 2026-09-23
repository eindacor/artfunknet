// ─── artfunknet default shader card ────────────────────────────────────────
//
// Uniforms injected automatically by ShaderCard:
//
//   uniform vec2      u_resolution;   // canvas size in pixels
//   uniform float     u_time;         // seconds since mount
//   uniform sampler2D u_image;        // full artwork texture (card variant)
//   uniform vec3      u_itemRarity;   // rarity-coded RGB  (see shader-utils.ts)
//   uniform float     u_condition;    // 0.0 – 1.0  (item condition)
//   uniform float     u_level;        // item promotion level  (float)
//   uniform float     u_foil;         // 1.0 if foil, else 0.0
//   uniform float     u_mint;         // 1.0 if mint, else 0.0
//
// Add any extra uniforms to the shaderUniforms prop on <ShaderCard>.
// ────────────────────────────────────────────────────────────────────────────

precision mediump float;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec3      u_itemRarity;
uniform float     u_condition;
uniform float     u_level;
uniform float     u_foil;
uniform float     u_mint;
uniform float     u_aspectRatio;

// ── helpers ─────────────────────────────────────────────────────────────────

vec2 cardUv() {
  vec2 uv = gl_FragCoord.xy/u_resolution;
  uv.y = 1. - uv.y;
  return uv;
}

vec2 imageUv() {
  // Normalized coordinates of the div.
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Flip Y for texture coordinates.
  uv.y = 1.0 - uv.y;

  // Aspect ratio of the div.
  float screenAspect = u_resolution.x / u_resolution.y;

  // Aspect ratio of the source image:
  // width / height.
  float imageAspect = u_aspectRatio;

  if (screenAspect > imageAspect) {
    // Div is wider than the image.
    //
    // The image must be scaled to the div's width.
    // This means the image extends beyond the top/bottom,
    // so crop vertically.
    float scale = imageAspect / screenAspect;

    uv.y = (uv.y - 0.5) * scale + 0.5;

  } else {
    // Div is taller/narrower than the image.
    //
    // The image must be scaled to the div's height.
    // This means the image extends beyond the left/right,
    // so crop horizontally.
    float scale = screenAspect / imageAspect;

    uv.x = (uv.x - 0.5) * scale + 0.5;
  }

  return uv;
}

// Cheap hash-based noise (no texture needed)
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
    u.y
  );
}

#define AA .002
#define PI 3.141592653
#define TWOPI 6.28318530718


vec2 rotatePointAroundOtherPoint(vec2 center, vec2 p, float angleInRadians) {
    mat2 rotationMatrix = mat2(
      cos(angleInRadians), -sin(angleInRadians),
        sin(angleInRadians), cos(angleInRadians)
    );
    
    return (rotationMatrix * (p - center)) + center;
}

float getHoldTransitionValue(float lower, float upper, float holdTime, float transitionTime, float time) {
    float period = 2. * holdTime + 2. * transitionTime;
    float halfPeriod = period / 2.;
    float relativeTime = fract(time / halfPeriod);
    float halfHoldTime = holdTime / 2.;
    
    float val = smoothstep(halfHoldTime, halfHoldTime + transitionTime, relativeTime * halfPeriod);
    
    if (mod(time / halfPeriod, 2.0) == 0.) {
        val = 1. - val;
    }

    return mix(lower, upper, val);
}

float getFadeIn(float fullyVisibleTime, float fadeTime, float time) {
    return smoothstep(fullyVisibleTime - fadeTime, fullyVisibleTime, time);
}

float getStepHoldTransitionValue(float lower, float upper, float holdTime, float transitionTime, float time) {
    float period = holdTime + transitionTime;
    float relativeTime = fract(time / period);
    return mix(lower, upper, smoothstep(holdTime / 2., period - holdTime / 2., mod(time, period)));
}

float getStripe(float val, float size) {
    return mod(val, size * 2.) < size ? 1. : 0.;
}

float stripe(float lower, float upper, float p) {
    return (smoothstep(lower - AA, lower + AA, p) * smoothstep(upper + AA, upper - AA, p));
}

float getDivisor(float time, float interval, float steps, float holdRatio) {
    int stepIndex = int(floor(time / interval));
    int nextStepIndex = stepIndex + 1;
    
    float firstVal = hash(vec2(float(stepIndex)));
    float secondVal = hash(vec2(float(nextStepIndex)));
    
    return mix(pow(2., floor(firstVal * 4.)), pow(2., floor(secondVal * 4.)), 
        getStepHoldTransitionValue(0., 1., interval * holdRatio, interval * (1. - holdRatio), time));
    
    float thisDivisor = float(stepIndex);
    float nextDivisor = float(stepIndex + 1);
}

float getValInColorSpace(float val) {
    float minVal = .1;
    float maxVal = 1.;
    float increment = (maxVal - minVal) / 4.;
    
    return minVal + increment * floor(val * 4.);
}

float getColorVal(float time, float interval, float steps, float noise, float holdRatio) {
    int stepIndex = int(noise * 58. + floor(time / interval));
    int nextStepIndex = stepIndex + 1;

    float firstVal = hash(vec2(float(stepIndex)));
    float secondVal = hash(vec2(float(nextStepIndex)));
    
    return mix(getValInColorSpace(firstVal), getValInColorSpace(secondVal), 
        getStepHoldTransitionValue(0., 1., interval * holdRatio, interval * (1. - holdRatio), time));
}

float getStripe(float stripeWidth, float offset, float val) {
    if (offset <= stripeWidth) {
        return 1.;
    }
    
    float stripeMod = mod(val, offset);
    if (stripeMod < stripeWidth) {
        return 1.;
    } else {
        float stripeAA = smoothstep(stripeWidth + AA, stripeWidth, stripeMod);
        float offsetAA = smoothstep(offset - AA, offset, stripeMod);
        return max(stripeAA, offsetAA);
    }
}

float getHoundStripe(float stripeWidth, float offset, vec2 uv) {
    float stripeX = getStripe(stripeWidth, offset, uv.x);
    float yVal = getStripe(stripeWidth, stripeWidth * 2., uv.y - uv.x);
    return stripeX * yVal;
}

vec4 getHoundsTooth(vec2 uv)
{
    float aspectRatio = u_resolution.x / u_resolution.y;
    uv.x *= aspectRatio;
    
    float bendFactor = sin(u_time * .1) * .2;
    
    //uv.y += sin(uv.x) * bendFactor;
    //uv.x += cos(uv.y) * bendFactor;
    
    float gridSize = .05;
    
    int gridRow = int(floor(uv.y/gridSize));
    int gridCol = int(floor(uv.x/gridSize));
    
    float interval = 10.;
    float steps = 10.;
    
    float currentStep = floor(u_time / interval);
    float nextStep = currentStep + 1.;
  
    float holdRatio = .5;
    
    bool houndsTooth = false;
    
    vec4 color0, color1, color2, color3;
    
    if (houndsTooth) {
        color0 = vec4(.2);
        color1 = vec4(.8);
        color2 = vec4(.2);
        color3 = vec4(.8);
    }
    else {
        color0 = vec4(getColorVal(u_time, interval, steps, hash(vec2(0.4)), holdRatio));
        color1 = vec4(getColorVal(u_time, interval, steps, hash(vec2(- 0.4)), holdRatio));
        color2 = vec4(getColorVal(u_time, interval, steps, hash(vec2(-0.1)), holdRatio));
        color3 = vec4(getColorVal(u_time, interval, steps, hash(vec2(0.7)), holdRatio));
    }
    
    float firstVal = getStripe(uv.x, gridSize);
    float secondVal = getStripe(uv.y, gridSize);
    
    float divisor = houndsTooth ? 4. : getDivisor(u_time, interval, steps, holdRatio);
    
    float gridDiagonal = sqrt(2. * gridSize * gridSize);
    float thirdVal = getStripe(rotatePointAroundOtherPoint(vec2(0.), uv, TWOPI / 8.).x, gridDiagonal / divisor);
    
    vec4 map1 = mix(color0, color1, firstVal);
    vec4 map2 = mix(color2, color3, secondVal);
    
    return mix(map1, map2, thirdVal);
}

vec2 getRandomVector(float seed) {
    vec2 outVec;

    if (seed < 0.25) {
        outVec = vec2(1.0, 1.0);
    } else if (seed < 0.5) {
        outVec = vec2(-1.0, 1.0);
    } else if (seed < 0.75) {
        outVec = vec2(1.0, -1.0);
    } else {
        outVec = vec2(-1.0, -1.0);
    }

    return outVec;
}

float biLerp(
    float f0,
    float f1,
    float f2,
    float f3,
    float lerpX,
    float lerpY
) {
    float upper = mix(f1, f2, lerpX);
    float lower = mix(f0, f3, lerpX);

    return mix(lower, upper, lerpY);
}

mat2 createRotationMatrix(float rotation) {
    float c = cos(rotation);
    float s = sin(rotation);

    return mat2(
        c, -s,
        s,  c
    );
}

float getModifiedDot(
    vec2 uv,
    vec2 p,
    float gridDimension,
    float pHash
) {
    float rotation = sin(u_time * 0.05 + pHash) * 2.0 * PI;

    if (pHash < 0.5) {
        rotation *= -1.0;
    }

    mat2 rotationMatrix = createRotationMatrix(rotation);

    vec2 offset = (uv - p) / gridDimension;
    vec2 randomVector = getRandomVector(pHash);

    return dot(
        offset,
        randomVector * rotationMatrix
    );
}

float getPerlinValue(
    vec2 uv,
    float gridDimension
) {
    float xCoord =
        floor(uv.x / gridDimension) * gridDimension;

    float yCoord =
        floor(uv.y / gridDimension) * gridDimension;

    float xIndex =
        floor(uv.x / gridDimension);

    float yIndex =
        floor(uv.y / gridDimension);

    float p0Hash = hash(vec2(
        xIndex,
        yIndex
    ));

    float p1Hash = hash(vec2(
        xIndex,
        yIndex + 1.0
    ));

    float p2Hash = hash(vec2(
        xIndex + 1.0,
        yIndex + 1.0
    ));

    float p3Hash = hash(vec2(
        xIndex + 1.0,
        yIndex
    ));

    vec2 p0 = vec2(
        xCoord,
        yCoord
    );

    vec2 p1 = vec2(
        xCoord,
        yCoord + gridDimension
    );

    vec2 p2 = vec2(
        xCoord + gridDimension,
        yCoord + gridDimension
    );

    vec2 p3 = vec2(
        xCoord + gridDimension,
        yCoord
    );

    float dot0 = getModifiedDot(
        uv,
        p0,
        gridDimension,
        p0Hash
    );

    float dot1 = getModifiedDot(
        uv,
        p1,
        gridDimension,
        p1Hash
    );

    float dot2 = getModifiedDot(
        uv,
        p2,
        gridDimension,
        p2Hash
    );

    float dot3 = getModifiedDot(
        uv,
        p3,
        gridDimension,
        p3Hash
    );

    float xInterp = smoothstep(
        p0.x,
        p2.x,
        uv.x
    );

    float yInterp = smoothstep(
        p0.y,
        p2.y,
        uv.y
    );

    float val = biLerp(
        dot0,
        dot1,
        dot2,
        dot3,
        xInterp,
        yInterp
    );

    float xLerp = mod(
        uv.x / 2.0,
        gridDimension
    );

    float revealMargin =
        gridDimension * 0.95;

    return val;

}

// ── main ────────────────────────────────────────────────────────────────────

void main() {
  vec2 uv_coords = cardUv();
  vec4 cardImageSample = texture2D(u_image, imageUv());

  float perlinVal = getPerlinValue(uv_coords * .05, .05);
  perlinVal = pow(perlinVal, .1);

  float transitionVal = pow((1. + sin(u_time * .5)) / 2., 4.);

  vec3 outColor = mix(u_itemRarity, cardImageSample.xyz, perlinVal);
  if ((perlinVal >= 0.) == false) {
    outColor = cardImageSample.xyz;
  }

  gl_FragColor = vec4(outColor, 1.0);
  return;

  // Sample the full artwork image
  vec4 artwork = texture2D(u_image, uv_coords);

  // Animated rarity glow that pulses with time
  float pulse = 0.5 + 0.5 * sin(u_time * 1.8);
  float n     = noise(uv_coords * 6.0 + u_time * 0.3);
  vec3  glow  = u_itemRarity * (0.35 + 0.25 * pulse + 0.15 * n);

  // Vignette
  vec2  center  = uv_coords - 0.5;
  float vignette = 1.0 - smoothstep(0.35, 0.75, length(center));

  // Foil shimmer — extra horizontal shimmer bands when foil
  float foilShimmer = u_foil * 0.18 *
    sin((uv_coords.y * 18.0 - u_time * 3.0) * 3.14159);

  // Blend artwork with rarity glow
  vec3 color = mix(glow, artwork.rgb, 0.78 * vignette);
  color += foilShimmer * u_itemRarity;

  // Mint tint: subtle cool-blue overlay
  color = mix(color, color + vec3(0.0, 0.06, 0.12), u_mint * 0.4);

  gl_FragColor = vec4(vec3(1.) - color, 1.0);

}
