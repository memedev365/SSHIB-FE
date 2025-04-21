// Loader.js
import React from 'react';
import Loader from 'react-loader-spinner';

const LoaderComponent = () => {
  return (
    <div style={loaderStyle}>
      <Loader
        type="Puff"
        color="#00BFFF"
        height={100}
        width={100}
      />
    </div>
  );
};

const loaderStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh'
};

export default LoaderComponent;
